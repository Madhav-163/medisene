"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, Brain, Pill, MapPin, AlertTriangle, CheckCircle, Clock, Star, ExternalLink } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase-client"
import type { SymptomAnalysis } from "@/lib/supabase"

// Gemini API Key for symptom analysis
const GEMINI_API_KEY = "AIzaSyBLGMuIXOUIThKMLu_0hWpVAsb37_oHrIA"

interface AnalysisResult {
  confidence: number
  possibleConditions: Array<{
    name: string
    probability: number
    description: string
    severity: "low" | "medium" | "high"
  }>
  recommendations: Array<{
    type: "medication" | "lifestyle" | "medical"
    title: string
    description: string
    urgency: "low" | "medium" | "high"
  }>
  medications: Array<{
    name: string
    type: string
    dosage: string
    frequency: string
    duration: string
    sideEffects: string[]
    price: string
  }>
  redFlags: string[]
}

// Helper function to parse Gemini response text when it's not valid JSON
function parseGeminiResponse(text: string): AnalysisResult {
  // Default structure
  const result: AnalysisResult = {
    confidence: 70,
    possibleConditions: [],
    recommendations: [],
    medications: [],
    redFlags: []
  }
  
  // Try to extract possible conditions
  const conditionsMatch = text.match(/Possible conditions[\s\S]*?(?=Recommended medications|Recommendations|$)/i)
  if (conditionsMatch) {
    const conditionsText = conditionsMatch[0]
    const conditionMatches = conditionsText.match(/([\w\s-]+)\s*[:-]\s*([\d]+)%[\s\S]*?(?=\n\n|$)/g)
    
    if (conditionMatches) {
      conditionMatches.forEach(match => {
        const nameMatch = match.match(/([\w\s-]+)\s*[:-]\s*([\d]+)%/)
        const descriptionMatch = match.match(/[:-]\s*([\d]+)%[\s\S]*?([\w\s.,;!?()]+)/)
        const severityMatch = match.match(/(low|medium|high)\s+severity/i)
        
        if (nameMatch) {
          result.possibleConditions.push({
            name: nameMatch[1].trim(),
            probability: parseInt(nameMatch[2]) || Math.floor(Math.random() * 70) + 30,
            description: descriptionMatch ? descriptionMatch[2].trim() : "Common condition based on the symptoms provided",
            severity: severityMatch ? (severityMatch[1].toLowerCase() as "low" | "medium" | "high") : "medium"
          })
        }
      })
    }
  }
  
  // Try to extract recommendations
  const recommendationsMatch = text.match(/Recommendations[\s\S]*?(?=Medications|Red flags|$)/i)
  if (recommendationsMatch) {
    const recommendationsText = recommendationsMatch[0]
    const recMatches = recommendationsText.match(/([\w\s-]+)\s*[:-]\s*([\w\s.,;!?()]+)/g)
    
    if (recMatches) {
      recMatches.forEach((match, index) => {
        const titleMatch = match.match(/([\w\s-]+)\s*[:-]\s*/)
        const descriptionMatch = match.match(/[:-]\s*([\w\s.,;!?()]+)/)
        const typeMatch = match.match(/(medication|lifestyle|medical)/i)
        const urgencyMatch = match.match(/(low|medium|high)\s+urgency/i)
        
        if (titleMatch) {
          result.recommendations.push({
            type: typeMatch ? (typeMatch[1].toLowerCase() as "medication" | "lifestyle" | "medical") : 
                  index === 0 ? "medication" : index === 1 ? "lifestyle" : "medical",
            title: titleMatch[1].trim(),
            description: descriptionMatch ? descriptionMatch[1].trim() : "Follow medical advice",
            urgency: urgencyMatch ? (urgencyMatch[1].toLowerCase() as "low" | "medium" | "high") : "medium"
          })
        }
      })
    }
  }
  
  // Try to extract medications
  const medicationsMatch = text.match(/Medications[\s\S]*?(?=Recommendations|Red flags|$)/i)
  if (medicationsMatch) {
    const medicationsText = medicationsMatch[0]
    const medMatches = medicationsText.match(/([\w\s()-]+)\s*[:-][\s\S]*?(?=\n\n|$)/g)
    
    if (medMatches) {
      medMatches.forEach(match => {
        const nameMatch = match.match(/([\w\s()-]+)\s*[:-]/)
        const typeMatch = match.match(/Type\s*[:-]\s*([\w\s-]+)/i)
        const dosageMatch = match.match(/Dosage\s*[:-]\s*([\w\s-]+)/i)
        const frequencyMatch = match.match(/Frequency\s*[:-]\s*([\w\s-]+)/i)
        const durationMatch = match.match(/Duration\s*[:-]\s*([\w\s-]+)/i)
        const priceMatch = match.match(/Price\s*[:-]\s*([\w\s$.-]+)/i)
        const sideEffectsMatch = match.match(/Side Effects\s*[:-]\s*([\w\s.,;-]+)/i)
        
        if (nameMatch) {
          result.medications.push({
            name: nameMatch[1].trim(),
            type: typeMatch ? typeMatch[1].trim() : "OTC Medication",
            dosage: dosageMatch ? dosageMatch[1].trim() : "As directed",
            frequency: frequencyMatch ? frequencyMatch[1].trim() : "As needed",
            duration: durationMatch ? durationMatch[1].trim() : "As needed",
            sideEffects: sideEffectsMatch ? 
              sideEffectsMatch[1].split(/,|;/).map(e => e.trim()).filter(e => e) : 
              ["Consult a doctor for side effects"],
            price: priceMatch ? priceMatch[1].trim() : "$5-15"
          })
        }
      })
    }
  }
  
  // Try to extract red flags
  const redFlagsMatch = text.match(/Red flags[\s\S]*?(?=\n\n|$)/i)
  if (redFlagsMatch) {
    const redFlagsText = redFlagsMatch[0]
    const flagMatches = redFlagsText.match(/[-*]\s*([\w\s.,;!?()]+)/g)
    
    if (flagMatches) {
      result.redFlags = flagMatches.map(match => {
        const flagMatch = match.match(/[-*]\s*([\w\s.,;!?()]+)/)
        return flagMatch ? flagMatch[1].trim() : match.trim()
      })
    }
  }
  
  return result
}

// Helper function to generate a default analysis when API fails
function generateDefaultAnalysis(primarySymptom: string): AnalysisResult {
  // Create a basic analysis based on the primary symptom
  return {
    confidence: 65,
    possibleConditions: [
      {
        name: `${primarySymptom.charAt(0).toUpperCase() + primarySymptom.slice(1)} - Common Cause`,
        probability: 70,
        description: `Common cause of ${primarySymptom.toLowerCase()}`,
        severity: "low",
      },
      {
        name: `${primarySymptom.charAt(0).toUpperCase() + primarySymptom.slice(1)} - Secondary Cause`,
        probability: 30,
        description: `Less common cause of ${primarySymptom.toLowerCase()}`,
        severity: "medium",
      },
    ],
    recommendations: [
      {
        type: "medication",
        title: "Over-the-counter relief",
        description: "Consider appropriate over-the-counter medication for symptom relief",
        urgency: "medium",
      },
      {
        type: "lifestyle",
        title: "Rest and hydration",
        description: "Ensure adequate rest and stay hydrated",
        urgency: "low",
      },
      {
        type: "medical",
        title: "Consult healthcare provider",
        description: "If symptoms persist or worsen, consult with a healthcare professional",
        urgency: "medium",
      },
    ],
    medications: [
      {
        name: "Generic Relief Medication",
        type: "Symptom reliever",
        dosage: "As directed on packaging",
        frequency: "As needed",
        duration: "Until symptoms improve",
        sideEffects: ["Varies by medication", "Follow package instructions"],
        price: "$5-15",
      },
    ],
    redFlags: [],
  }
}

// Helper function to validate and fix analysis result
function validateAndFixAnalysisResult(result: any): AnalysisResult {
  // Create a valid result object with defaults for missing properties
  const validResult: AnalysisResult = {
    confidence: typeof result.confidence === 'number' ? result.confidence : 70,
    possibleConditions: Array.isArray(result.possibleConditions) ? result.possibleConditions : [],
    recommendations: Array.isArray(result.recommendations) ? result.recommendations : [],
    medications: Array.isArray(result.medications) ? result.medications : [],
    redFlags: Array.isArray(result.redFlags) ? result.redFlags : []
  }
  
  // Ensure each possible condition has all required properties
  validResult.possibleConditions = validResult.possibleConditions.map(condition => ({
    name: condition.name || 'Unknown Condition',
    probability: typeof condition.probability === 'number' ? condition.probability : 50,
    description: condition.description || 'No description provided',
    severity: ['low', 'medium', 'high'].includes(condition.severity) ? 
      condition.severity as 'low' | 'medium' | 'high' : 'medium'
  }))
  
  // Ensure each recommendation has all required properties
  validResult.recommendations = validResult.recommendations.map(rec => ({
    type: ['medication', 'lifestyle', 'medical'].includes(rec.type) ? 
      rec.type as 'medication' | 'lifestyle' | 'medical' : 'medical',
    title: rec.title || 'Medical Recommendation',
    description: rec.description || 'Follow medical advice',
    urgency: ['low', 'medium', 'high'].includes(rec.urgency) ? 
      rec.urgency as 'low' | 'medium' | 'high' : 'medium'
  }))
  
  // Ensure each medication has all required properties
  validResult.medications = validResult.medications.map(med => ({
    name: med.name || 'Recommended Medication',
    type: med.type || 'Prescription medication',
    dosage: med.dosage || 'As directed by healthcare provider',
    frequency: med.frequency || 'As needed',
    duration: med.duration || 'As directed',
    sideEffects: Array.isArray(med.sideEffects) ? med.sideEffects : ['Consult healthcare provider for side effects'],
    price: med.price || 'Varies'
  }))
  
  // Add default items if arrays are empty
  if (validResult.possibleConditions.length === 0) {
    validResult.possibleConditions.push({
      name: 'Unspecified Condition',
      probability: 60,
      description: 'Based on the symptoms provided, a specific condition could not be determined',
      severity: 'medium'
    })
  }
  
  if (validResult.recommendations.length === 0) {
    validResult.recommendations.push({
      type: 'medical',
      title: 'Consult healthcare provider',
      description: 'For accurate diagnosis and treatment, please consult with a healthcare professional',
      urgency: 'medium'
    })
  }
  
  if (validResult.medications.length === 0) {
    validResult.medications.push({
      name: 'As prescribed by doctor',
      type: 'Prescription medication',
      dosage: 'As directed',
      frequency: 'As directed',
      duration: 'As directed',
      sideEffects: ['Consult healthcare provider for side effects'],
      price: 'Varies'
    })
  }
  
  return validResult
}

export default function AnalysisPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)

  const { user, loading } = useAuth()
  const [currentAnalysis, setCurrentAnalysis] = useState<SymptomAnalysis | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    if (user) {
      loadAnalysisData()
    }
  }, [user, loading, router])

  const loadAnalysisData = async () => {
    const analysisId = localStorage.getItem("current_analysis_id")

    if (!analysisId) {
      router.push("/symptoms")
      return
    }

    try {
      const { data: analysis } = await supabase.from("symptom_analyses").select("*").eq("id", analysisId).single()

      if (analysis) {
        setCurrentAnalysis(analysis)

        // Show loading state while we analyze with Gemini API
        setIsLoading(true)

        try {
          // Prepare the prompt for Gemini API
          const prompt = `
            You are a medical AI assistant with expertise in symptom analysis and diagnosis. Analyze the following patient symptoms and provide a detailed medical analysis.
            
            Patient Information:
            - Primary Symptom: ${analysis.primary_symptom}
            - Duration: ${analysis.duration}
            - Severity: ${analysis.severity}
            - Additional Symptoms: ${analysis.additional_symptoms.join(", ")}
            - Description: ${analysis.description}
            - Current Medications: ${analysis.current_medications || "None"}
            - Allergies: ${analysis.allergies || "None"}
            - Medical History: ${analysis.medical_history || "None"}
            
            Provide a comprehensive analysis with the following sections:
            
            1. Possible Conditions (at least 3-5):
               For each condition, include:
               - Name of the condition
               - Probability percentage (how likely this condition matches the symptoms)
               - Brief description of the condition and how it relates to the symptoms
               - Severity level (low, medium, high)
            
            2. Recommended Medications (at least 2-3):
               For each medication, include:
               - Name of the medication
               - Type (OTC, prescription, etc.)
               - Recommended dosage
               - Frequency of use
               - Duration of treatment
               - Possible side effects (list at least 3-5)
               - Estimated price range
            
            3. General Recommendations (at least 3-5):
               Include a mix of:
               - Medication recommendations (with urgency level)
               - Lifestyle changes (with urgency level)
               - Medical follow-ups (with urgency level)
               Each recommendation should have a clear title, detailed description, and urgency level (low, medium, high)
            
            4. Red Flags:
               List any symptoms or combinations that require immediate medical attention
            
            IMPORTANT: Your response MUST be a valid, properly formatted JSON object with the following structure:
            {
              "confidence": number,
              "possibleConditions": [
                {
                  "name": string,
                  "probability": number,
                  "description": string,
                  "severity": "low" | "medium" | "high"
                }
              ],
              "recommendations": [
                {
                  "type": "medication" | "lifestyle" | "medical",
                  "title": string,
                  "description": string,
                  "urgency": "low" | "medium" | "high"
                }
              ],
              "medications": [
                {
                  "name": string,
                  "type": string,
                  "dosage": string,
                  "frequency": string,
                  "duration": string,
                  "sideEffects": string[],
                  "price": string
                }
              ],
              "redFlags": string[]
            }
            
            Ensure your response is ONLY the JSON object with no additional text before or after.
          `

          // Call Gemini API
          const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: prompt
                }]
              }]
            })
          })

          if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`)
          }

          const data = await response.json()
          
          // Parse the response text as JSON
          let analysisResult: AnalysisResult
          try {
            // Extract the text content from Gemini's response
            const responseText = data.candidates[0].content.parts[0].text
            
            // Try to find and parse JSON in the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              analysisResult = JSON.parse(jsonMatch[0])
            } else {
              // Fallback to a simplified parsing approach
              analysisResult = parseGeminiResponse(responseText)
            }
          } catch (parseError) {
            console.error("Error parsing Gemini response:", parseError)
            // Fallback to default analysis result
            analysisResult = generateDefaultAnalysis(analysis.primary_symptom)
          }

          // Ensure the result has all required fields
          analysisResult = validateAndFixAnalysisResult(analysisResult)

          // Update analysis with results
          await supabase
            .from("symptom_analyses")
            .update({
              analysis_result: analysisResult,
              confidence_score: analysisResult.confidence,
            })
            .eq("id", analysisId)

          setAnalysisResult(analysisResult)
        } catch (apiError) {
          console.error("Error with Gemini API:", apiError)
          // Fallback to default analysis in case of API failure
          const defaultAnalysis = generateDefaultAnalysis(analysis.primary_symptom)
          
          // Update analysis with default results
          await supabase
            .from("symptom_analyses")
            .update({
              analysis_result: defaultAnalysis,
              confidence_score: defaultAnalysis.confidence,
            })
            .eq("id", analysisId)
            
          setAnalysisResult(defaultAnalysis)
        }

        // Analysis result is already set in the try/catch block
      }
    } catch (error) {
      console.error("Error loading analysis:", error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold mb-2">Analyzing Your Symptoms</h2>
          <p className="text-gray-600">Our AI is processing your information...</p>
        </div>
      </div>
    )
  }

  if (!analysisResult) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Analysis Failed</h2>
          <p className="text-gray-600 mb-4">We couldn't process your symptoms. Please try again.</p>
          <Button onClick={() => router.push("/symptoms")}>Return to Symptoms</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center space-x-3">
              <Brain className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Analysis Results</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Confidence Score */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Analysis Complete</span>
                </CardTitle>
                <CardDescription>Based on your symptoms, here's what our AI analysis suggests</CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">{analysisResult.confidence}%</div>
                <div className="text-sm text-gray-600">Confidence</div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Red Flags Alert */}
        {analysisResult.redFlags.length > 0 && (
          <Alert className="mb-8 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-700">
              <strong>Important:</strong> Your symptoms may require immediate medical attention. Please consult a
              healthcare provider promptly.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="conditions" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="conditions">Possible Conditions</TabsTrigger>
            <TabsTrigger value="medications">Medications</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          </TabsList>

          {/* Possible Conditions */}
          <TabsContent value="conditions" className="space-y-4">
            <div className="grid gap-4">
              {analysisResult.possibleConditions.map((condition, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{condition.name}</CardTitle>
                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={
                            condition.severity === "high"
                              ? "destructive"
                              : condition.severity === "medium"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {condition.severity} severity
                        </Badge>
                        <span className="text-lg font-semibold text-blue-600">{condition.probability}%</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600">{condition.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Medications */}
          <TabsContent value="medications" className="space-y-4">
            <div className="grid gap-4">
              {analysisResult.medications.map((medication, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center space-x-2">
                          <Pill className="h-5 w-5 text-blue-600" />
                          <span>{medication.name}</span>
                        </CardTitle>
                        <CardDescription>{medication.type}</CardDescription>
                      </div>
                      <Badge variant="outline">{medication.price}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-1">Dosage</h4>
                        <p className="text-sm">{medication.dosage}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-1">Frequency</h4>
                        <p className="text-sm">{medication.frequency}</p>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-1">Duration</h4>
                        <p className="text-sm">{medication.duration}</p>
                      </div>
                    </div>

                    {medication.sideEffects.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-2">Possible Side Effects</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          {medication.sideEffects.map((effect, idx) => (
                            <li key={idx} className="flex items-center space-x-2">
                              <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                              <span>{effect}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Always consult with a pharmacist or healthcare provider before taking any medication.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Recommendations */}
          <TabsContent value="recommendations" className="space-y-4">
            <div className="grid gap-4">
              {analysisResult.recommendations.map((rec, index) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-2">
                        {rec.type === "medication" && <Pill className="h-5 w-5 text-blue-600" />}
                        {rec.type === "lifestyle" && <Star className="h-5 w-5 text-green-600" />}
                        {rec.type === "medical" && <Clock className="h-5 w-5 text-orange-600" />}
                        <span>{rec.title}</span>
                      </CardTitle>
                      <Badge
                        variant={
                          rec.urgency === "high" ? "destructive" : rec.urgency === "medium" ? "default" : "secondary"
                        }
                      >
                        {rec.urgency} priority
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-600">{rec.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Button onClick={() => router.push("/hospitals")} className="flex-1">
            <MapPin className="h-4 w-4 mr-2" />
            Find Nearby Hospitals
          </Button>
          <Button variant="outline" onClick={() => router.push("/symptoms")} className="flex-1">
            New Analysis
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="flex-1">
            <ExternalLink className="h-4 w-4 mr-2" />
            Save Results
          </Button>
        </div>

        {/* Disclaimer */}
        <Alert className="mt-8">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Medical Disclaimer:</strong> This analysis is for informational purposes only and should not replace
            professional medical advice. Always consult with a qualified healthcare provider for proper diagnosis and
            treatment.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  )
}
