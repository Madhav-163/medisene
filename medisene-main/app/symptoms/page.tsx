"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, ArrowRight, Stethoscope, AlertTriangle, Mic, MicOff, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase-client"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface SymptomData {
  primarySymptom: string
  duration: string
  severity: string
  additionalSymptoms: string[]
  description: string
  medications: string
  allergies: string
  medicalHistory: string
}

export default function SymptomsPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [symptomData, setSymptomData] = useState<SymptomData>({
    primarySymptom: "",
    duration: "",
    severity: "",
    additionalSymptoms: [],
    description: "",
    medications: "",
    allergies: "",
    medicalHistory: "",
  })

  // Voice input states
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [voiceInputTarget, setVoiceInputTarget] = useState<keyof SymptomData | null>(null)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const recognitionRef = useRef<any>(null)

  const totalSteps = 4
  const progress = (currentStep / totalSteps) * 100

  const { user, loading } = useAuth()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
    }

    // Check if SpeechRecognition is supported
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SpeechRecognition) {
        setVoiceSupported(false)
      }
    }
  }, [user, loading, router])

  const commonSymptoms = [
    "Headache",
    "Fever",
    "Cough",
    "Sore throat",
    "Nausea",
    "Fatigue",
    "Dizziness",
    "Chest pain",
    "Shortness of breath",
    "Abdominal pain",
    "Back pain",
    "Joint pain",
    "Skin rash",
    "Diarrhea",
    "Constipation",
  ]

  const handleSymptomToggle = (symptom: string) => {
    setSymptomData((prev) => ({
      ...prev,
      additionalSymptoms: prev.additionalSymptoms.includes(symptom)
        ? prev.additionalSymptoms.filter((s) => s !== symptom)
        : [...prev.additionalSymptoms, symptom],
    }))
  }

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    } else {
      handleSubmit()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    if (!user) return

    setIsLoading(true)

    try {
      // Save symptom analysis to Supabase
      const { data, error } = await supabase
        .from("symptom_analyses")
        .insert({
          user_id: user.id,
          primary_symptom: symptomData.primarySymptom,
          duration: symptomData.duration,
          severity: symptomData.severity,
          additional_symptoms: symptomData.additionalSymptoms,
          description: symptomData.description,
          medications_context: symptomData.medications,
          allergies_context: symptomData.allergies,
          medical_history_context: symptomData.medicalHistory,
        })
        .select()
        .single()

      if (error) {
        console.error("Error saving symptom analysis:", error)
        return
      }

      // Simulate AI analysis
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Store analysis ID for results page
      localStorage.setItem("current_analysis_id", data.id)

      router.push("/analysis")
    } catch (error) {
      console.error("Error submitting symptoms:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return symptomData.primarySymptom && symptomData.duration && symptomData.severity
      case 2:
        return true // Additional symptoms are optional
      case 3:
        return symptomData.description.trim().length > 0
      case 4:
        return true // Medical history is optional but recommended
      default:
        return false
    }
  }

  // Voice input functions
  const startVoiceInput = async (field: keyof SymptomData) => {
    if (!voiceSupported) return

    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      console.error("Microphone permission denied:", error)
      alert("Please allow microphone access to use voice input.")
      return
    }

    setVoiceInputTarget(field)
    setTranscript("")
    setIsRecording(true)

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()

      // Configure recognition settings
      recognitionRef.current.continuous = false // Changed to false for better control
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = "en-US"
      recognitionRef.current.maxAlternatives = 1

      let finalTranscriptText = ""

      recognitionRef.current.onstart = () => {
        console.log("Speech recognition started")
      }

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = ""
        let finalTranscript = ""

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        const currentTranscript = finalTranscript || interimTranscript
        setTranscript(currentTranscript)

        // Store final transcript
        if (finalTranscript) {
          finalTranscriptText = finalTranscript
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error)

        let errorMessage = "Voice input failed. Please try again."

        switch (event.error) {
          case "no-speech":
            errorMessage = "No speech detected. Please speak clearly and try again."
            break
          case "audio-capture":
            errorMessage = "Microphone not found. Please check your microphone connection."
            break
          case "not-allowed":
            errorMessage = "Microphone access denied. Please allow microphone permissions."
            break
          case "network":
            errorMessage = "Network error. Please check your internet connection."
            break
          case "aborted":
            errorMessage = "Voice input was cancelled."
            break
          default:
            errorMessage = `Voice input error: ${event.error}. Please try typing instead.`
        }

        // Show error to user (you might want to use a toast notification instead)
        if (event.error !== "aborted") {
          alert(errorMessage)
        }

        stopVoiceInput()
      }

      recognitionRef.current.onend = () => {
        console.log("Speech recognition ended")

        // Apply the final transcript to the field if we have one
        if (finalTranscriptText && field) {
          setSymptomData((prev) => {
            const currentValue = prev[field] as string
            const newValue = currentValue ? `${currentValue} ${finalTranscriptText}`.trim() : finalTranscriptText
            return {
              ...prev,
              [field]: newValue,
            }
          })
        }

        stopVoiceInput()
      }

      // Start recognition
      recognitionRef.current.start()

      // Auto-stop after 30 seconds to prevent hanging
      setTimeout(() => {
        if (isRecording && recognitionRef.current) {
          recognitionRef.current.stop()
        }
      }, 30000)
    } catch (error) {
      console.error("Error starting speech recognition:", error)
      alert("Voice input is not available. Please use text input instead.")
      setVoiceSupported(false)
      stopVoiceInput()
    }
  }

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (error) {
        console.error("Error stopping speech recognition:", error)
      }
    }
    setIsRecording(false)
    setVoiceInputTarget(null)
    setTranscript("")
  }

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup on component unmount
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (error) {
          console.error("Error cleaning up speech recognition:", error)
        }
      }
    }
  }, [])

  // Voice button component
  const VoiceButton = ({ field, label }: { field: keyof SymptomData; label: string }) => {
    if (!voiceSupported) return null

    const isCurrentlyRecording = isRecording && voiceInputTarget === field

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isCurrentlyRecording ? "destructive" : "outline"}
              size="icon"
              className={`ml-2 ${isCurrentlyRecording ? "animate-pulse" : ""}`}
              onClick={() => (isCurrentlyRecording ? stopVoiceInput() : startVoiceInput(field))}
              disabled={isRecording && !isCurrentlyRecording} // Disable other buttons when recording
            >
              {isCurrentlyRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              <span className="sr-only">{isCurrentlyRecording ? "Stop recording" : "Start voice input"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isCurrentlyRecording ? "Click to stop recording" : `Click and speak to enter ${label}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center py-4">
            <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center space-x-3">
              <Stethoscope className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-semibold text-gray-900">Symptom Analysis</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>
              Step {currentStep} of {totalSteps}
            </span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {!voiceSupported && (
          <Alert className="mb-4 bg-yellow-50 border-yellow-200">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700">
              Voice input is not supported in your browser. Please use text input instead.
            </AlertDescription>
          </Alert>
        )}

        {isRecording && (
          <Alert className="mb-4 bg-blue-50 border-blue-200">
            <div className="flex items-center">
              <div className="relative mr-3">
                <div className="h-3 w-3 rounded-full bg-red-600 animate-ping absolute"></div>
                <div className="h-3 w-3 rounded-full bg-red-600 relative"></div>
              </div>
              <AlertDescription className="text-blue-700 flex-1">
                <div className="font-medium">Recording in progress...</div>
                <div className="text-sm">
                  Speak clearly to describe your{" "}
                  {voiceInputTarget === "primarySymptom"
                    ? "main symptom"
                    : voiceInputTarget === "description"
                      ? "symptoms in detail"
                      : voiceInputTarget === "medications"
                        ? "current medications"
                        : voiceInputTarget === "allergies"
                          ? "allergies"
                          : voiceInputTarget === "medicalHistory"
                            ? "medical history"
                            : "symptoms"}
                  . The recording will stop automatically after 30 seconds.
                </div>
              </AlertDescription>
              <Button variant="ghost" size="sm" onClick={stopVoiceInput} className="ml-auto">
                Stop Recording
              </Button>
            </div>
            {transcript && (
              <div className="mt-3 p-2 bg-white rounded border text-sm text-gray-700">
                <strong>Transcription:</strong> "{transcript}"
              </div>
            )}
          </Alert>
        )}

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>
              {currentStep === 1 && "Primary Symptom"}
              {currentStep === 2 && "Additional Symptoms"}
              {currentStep === 3 && "Detailed Description"}
              {currentStep === 4 && "Medical History"}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && "Tell us about your main concern"}
              {currentStep === 2 && "Select any additional symptoms you're experiencing"}
              {currentStep === 3 && "Provide more details about your symptoms"}
              {currentStep === 4 && "Help us understand your medical background"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Primary Symptom */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="primarySymptom">What is your main symptom?</Label>
                    <VoiceButton field="primarySymptom" label="main symptom" />
                  </div>
                  <Select
                    value={symptomData.primarySymptom}
                    onValueChange={(value) => setSymptomData((prev) => ({ ...prev, primarySymptom: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your primary symptom" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonSymptoms.map((symptom) => (
                        <SelectItem key={symptom} value={symptom}>
                          {symptom}
                        </SelectItem>
                      ))}
                      <SelectItem value="other">Other (please describe)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {symptomData.primarySymptom === "other" && (
                  <div className="space-y-2">
                    <Label htmlFor="customSymptom">Please describe your symptom</Label>
                    <Input
                      id="customSymptom"
                      placeholder="Describe your symptom"
                      onChange={(e) => setSymptomData((prev) => ({ ...prev, primarySymptom: e.target.value }))}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <Label>How long have you been experiencing this symptom?</Label>
                  <RadioGroup
                    value={symptomData.duration}
                    onValueChange={(value) => setSymptomData((prev) => ({ ...prev, duration: value }))}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="less-than-day" id="less-than-day" />
                      <Label htmlFor="less-than-day">Less than a day</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1-3-days" id="1-3-days" />
                      <Label htmlFor="1-3-days">1-3 days</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="4-7-days" id="4-7-days" />
                      <Label htmlFor="4-7-days">4-7 days</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="1-2-weeks" id="1-2-weeks" />
                      <Label htmlFor="1-2-weeks">1-2 weeks</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="more-than-2-weeks" id="more-than-2-weeks" />
                      <Label htmlFor="more-than-2-weeks">More than 2 weeks</Label>
                    </div>
                  </RadioGroup>
                </div>

                <div className="space-y-3">
                  <Label>How would you rate the severity?</Label>
                  <RadioGroup
                    value={symptomData.severity}
                    onValueChange={(value) => setSymptomData((prev) => ({ ...prev, severity: value }))}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="mild" id="mild" />
                      <Label htmlFor="mild">Mild - Barely noticeable</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="moderate" id="moderate" />
                      <Label htmlFor="moderate">Moderate - Noticeable but manageable</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="severe" id="severe" />
                      <Label htmlFor="severe">Severe - Significantly affects daily activities</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="very-severe" id="very-severe" />
                      <Label htmlFor="very-severe">Very Severe - Unbearable</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

            {/* Step 2: Additional Symptoms */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Select any additional symptoms you're experiencing (optional):</p>
                <div className="grid grid-cols-2 gap-3">
                  {commonSymptoms
                    .filter((symptom) => symptom !== symptomData.primarySymptom)
                    .map((symptom) => (
                      <div key={symptom} className="flex items-center space-x-2">
                        <Checkbox
                          id={symptom}
                          checked={symptomData.additionalSymptoms.includes(symptom)}
                          onCheckedChange={() => handleSymptomToggle(symptom)}
                        />
                        <Label htmlFor={symptom} className="text-sm">
                          {symptom}
                        </Label>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Step 3: Detailed Description */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="description">Please describe your symptoms in detail</Label>
                    <VoiceButton field="description" label="symptom details" />
                  </div>
                  <Textarea
                    id="description"
                    placeholder="Describe when the symptoms started, what makes them better or worse, any patterns you've noticed, etc."
                    value={symptomData.description}
                    onChange={(e) => setSymptomData((prev) => ({ ...prev, description: e.target.value }))}
                    rows={6}
                  />
                </div>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    The more details you provide, the better our AI can analyze your symptoms and provide accurate
                    recommendations.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Step 4: Medical History */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="medications">Current Medications (optional)</Label>
                    <VoiceButton field="medications" label="medications" />
                  </div>
                  <Textarea
                    id="medications"
                    placeholder="List any medications, supplements, or vitamins you're currently taking"
                    value={symptomData.medications}
                    onChange={(e) => setSymptomData((prev) => ({ ...prev, medications: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="allergies">Known Allergies (optional)</Label>
                    <VoiceButton field="allergies" label="allergies" />
                  </div>
                  <Textarea
                    id="allergies"
                    placeholder="List any known allergies to medications, foods, or other substances"
                    value={symptomData.allergies}
                    onChange={(e) => setSymptomData((prev) => ({ ...prev, allergies: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="medicalHistory">Relevant Medical History (optional)</Label>
                    <VoiceButton field="medicalHistory" label="medical history" />
                  </div>
                  <Textarea
                    id="medicalHistory"
                    placeholder="Any relevant medical conditions, recent illnesses, surgeries, or family history"
                    value={symptomData.medicalHistory}
                    onChange={(e) => setSymptomData((prev) => ({ ...prev, medicalHistory: e.target.value }))}
                    rows={4}
                  />
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This information helps provide more personalized recommendations. All data is encrypted and secure.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between pt-6">
              <Button variant="outline" onClick={handlePrevious} disabled={currentStep === 1}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              <Button onClick={handleNext} disabled={!canProceed() || isLoading}>
                {isLoading ? (
                  <span className="flex items-center">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </span>
                ) : currentStep === totalSteps ? (
                  "Analyze Symptoms"
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
