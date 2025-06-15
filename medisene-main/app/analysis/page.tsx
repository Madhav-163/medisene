"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
    const initialAnalysisId = localStorage.getItem("current_analysis_id")

    if (!initialAnalysisId) {
      router.push("/symptoms")
      setIsLoading(false)
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from("symptom_analyses")
        .select("*")
        .eq("id", initialAnalysisId)
        .single()

      if (fetchError) {
        console.error("Error fetching analysis data:", fetchError)
        setIsLoading(false)
        return
      }

      const analysis = data as unknown as SymptomAnalysis | null

      if (analysis) {
        setCurrentAnalysis(analysis)

        setIsLoading(true)
        setAnalysisResult(null)

          const prompt = `
          Analyze the following user symptoms and medical context to provide a health analysis.
          Your response MUST be a single JSON object that strictly adheres to the following structure:
            {
            "confidence": number (0-1, e.g., 0.85),
              "possibleConditions": [
                {
                  "name": string,
                "probability": number (0-1),
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
                "name": string, (For common ailments like fever or cold, please suggest widely recognized OTC medications (e.g., Dolo/Paracetamol for fever, a suitable combination for cold like Cold Act, or an antihistamine like Cetirizine) if appropriate. For other conditions, provide generic or common prescription names.)
                "type": string (OTC, prescription, etc.),
                  "dosage": string,
                  "frequency": string,
                  "duration": string,
                "sideEffects": string[]
              }
            ],
            "warnings": string[],
            "followUp": string,
            "emergencySymptoms": string[]
                }

          User Data:
          {
            "primary_symptom": "${analysis.primary_symptom}",
            "other_symptoms": ["${(analysis.additional_symptoms || []).join('", "')}"],
            "symptom_details": [{
              "symptom": "${analysis.primary_symptom}",
              "duration": "${analysis.duration}",
              "severity": "${analysis.severity}",
              "notes": "${analysis.description || 'N/A'}"
            }],
            "medications_context": "${analysis.medications_context || "Not provided"}",
            "allergies_context": "${analysis.allergies_context || "Not provided"}",
            "medical_history_context": "${analysis.medical_history_context || "Not provided"}"
          }

          Instructions:
          1. Possible Conditions: List at least 2-3 potential conditions with their likelihood.
          2. Recommended Medications (at least 2-3):
             For each medication, include:
             - Name of the medication (For common ailments like fever or cold, please suggest widely recognized OTC medications (e.g., Dolo/Paracetamol for fever, a suitable combination for cold like Cold Act, or an antihistamine like Cetirizine) if appropriate. For other conditions, provide generic or common prescription names.)
             - Type (OTC, prescription, etc.)
             - Recommended dosage
             - Frequency of use
             - Duration of use
             - Key potential side effects (briefly)
          3. Lifestyle/Medical Recommendations: Provide actionable advice.
          4. Warnings: Highlight any red flags or symptoms requiring immediate attention.
          5. Follow-up: Suggest when to see a doctor or if self-care is appropriate.
          6. Confidence Score: Overall confidence in this analysis.
            Ensure your response is ONLY the JSON object with no additional text before or after.
          `

        try {
          const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + GEMINI_API_KEY, {
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

          if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text()
            throw new Error(`Gemini API Error ${geminiResponse.status}: ${errorText}`)
          }

          const dataFromGemini = await geminiResponse.json()
          
          const textResponse = dataFromGemini.candidates?.[0]?.content?.parts?.[0]?.text
            
          let currentAnalysisResult: AnalysisResult
          try {
            const jsonMatch = textResponse ? textResponse.match(/{[\s\S]*}/) : null
            if (jsonMatch && jsonMatch[0]) {
              currentAnalysisResult = JSON.parse(jsonMatch[0])
            } else {
              console.warn("Could not parse JSON from Gemini response, or response was empty. Text response:", textResponse)
              currentAnalysisResult = parseGeminiResponse(textResponse || "")
            }
          } catch (parseError: any) {
            console.error("Error parsing Gemini response:", parseError)
            currentAnalysisResult = generateDefaultAnalysis(analysis.primary_symptom || "Unknown Symptom")
          }

          currentAnalysisResult = validateAndFixAnalysisResult(currentAnalysisResult)

          await supabase
            .from("symptom_analyses")
            .update({
              analysis_result: currentAnalysisResult,
              confidence_score: currentAnalysisResult.confidence,
              api_prompt: prompt,
              api_response: textResponse
            })
            .eq("id", initialAnalysisId)

          setAnalysisResult(currentAnalysisResult)
        } catch (apiError: any) {
          console.error("Error processing analysis:", apiError)
          if (analysis && analysis.primary_symptom) {
          const defaultAnalysis = generateDefaultAnalysis(analysis.primary_symptom)
            setAnalysisResult(defaultAnalysis)
          await supabase
            .from("symptom_analyses")
            .update({
              analysis_result: defaultAnalysis,
              confidence_score: defaultAnalysis.confidence,
                api_prompt: prompt,
                api_response: `Error: ${apiError.message}`
            })
              .eq("id", initialAnalysisId)
          } else {
            const defaultAnalysis = generateDefaultAnalysis("Unknown Symptom")
          setAnalysisResult(defaultAnalysis)
             await supabase
              .from("symptom_analyses")
              .update({
                analysis_result: defaultAnalysis,
                confidence_score: defaultAnalysis.confidence,
                api_prompt: prompt,
                api_response: `Error: ${apiError.message}`
              })
              .eq("id", initialAnalysisId)
          }
        }
      } else {
        console.error("Analysis data not found after fetch for ID:", initialAnalysisId)
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
      <div className="container mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center p-4 text-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Analysis Not Available</AlertTitle>
          <AlertDescription>
            We couldn't find or generate an analysis for your symptoms. This might be due to an error or missing data.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push("/symptoms")} className="mt-6">
          Return to Symptoms
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <Card className="max-w-4xl mx-auto shadow-lg">
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
                <div className="text-2xl font-bold text-green-600">{Math.round(analysisResult.confidence * 100)}%</div>
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
                        <span className="text-lg font-semibold text-blue-600">{Math.round(condition.probability * 100)}%</span>
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
      </Card>

      <div className="max-w-4xl mx-auto mt-8 text-center">
        <Button onClick={() => router.push("/dashboard")} variant="outline" className="mr-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Go to Dashboard
        </Button>
        <Button onClick={() => router.push("/symptoms")}>
          Analyze New Symptoms
        </Button>
      </div>
    </div>
  )
}
