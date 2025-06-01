"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Heart, Stethoscope, MapPin, User, LogOut, Activity, Calendar, Clock, TrendingUp } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase-client"
import type { User as UserProfile, SymptomAnalysis } from "@/lib/supabase"

// Store API keys in environment variables for security
const GEMINI_API_KEY = "AIzaSyBLGMuIXOUIThKMLu_0hWpVAsb37_oHrIA"
const GOOGLE_MAPS_API_KEY = "AIzaSyAigzVKeNFdqDQjCw_D9SBZGuXFl0hF3oA"

export default function DashboardPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [recentAnalyses, setRecentAnalyses] = useState<SymptomAnalysis[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [healthScore, setHealthScore] = useState(0)
  const [nextCheckupDays, setNextCheckupDays] = useState(0)
  const [activePrescriptions, setActivePrescriptions] = useState(0)
  const [healthReminders, setHealthReminders] = useState<any[]>([])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    if (user) {
      loadUserData()
      
      // Set up real-time subscription for symptom analyses
      const analysesSubscription = supabase
        .channel('analyses-changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'symptom_analyses',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => {
          // Refresh data when changes occur
          loadUserData()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(analysesSubscription)
      }
    }
  }, [user, loading, router])

  const loadUserData = async () => {
    if (!user) return

    try {
      // Load user profile
      const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single()

      if (profile) {
        setUserProfile(profile)
      }

      // Load all symptom analyses
      const { data: analyses } = await supabase
        .from("symptom_analyses")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })

      if (analyses) {
        setRecentAnalyses(analyses)
        
        // Calculate health score based on analyses and profile data
        if (analyses.length > 0) {
          // Start with a base score
          let score = 70
          
          // Adjust score based on number of severe symptoms
          const severeSymptoms = analyses.filter(a => a.severity === 'severe' || a.severity === 'very-severe')
          score -= severeSymptoms.length * 5
          
          // Adjust score based on frequency of consultations (more regular check-ups = better score)
          score += Math.min(analyses.length * 3, 15)
          
          // Cap the score between 0 and 100
          score = Math.max(0, Math.min(100, score))
          
          setHealthScore(score)
          
          // Set next checkup days - calculate based on last analysis date
          const lastAnalysisDate = new Date(analyses[0].created_at)
          const nextCheckup = new Date(lastAnalysisDate)
          nextCheckup.setDate(nextCheckup.getDate() + 30) // Assume checkup is due 30 days after last analysis
          const today = new Date()
          const diffTime = nextCheckup.getTime() - today.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
          setNextCheckupDays(diffDays > 0 ? diffDays : 0)
          
          // Set active prescriptions based on analyses
          // For demo purposes, we'll set it to the number of unique primary symptoms
          const uniqueSymptoms = new Set(analyses.map(a => a.primary_symptom))
          setActivePrescriptions(uniqueSymptoms.size)
        } else {
          // Default values for new users
          setHealthScore(0)
          setNextCheckupDays(30) // Default to 30 days for new users
          setActivePrescriptions(0)
        }
        
        // Generate health reminders based on profile and analyses
        const reminders = []
        
        if (analyses && analyses.length > 0) {
          // Add reminder based on most recent analysis
          const latestAnalysis = analyses[0]
          if (latestAnalysis.severity === 'severe' || latestAnalysis.severity === 'very-severe') {
            reminders.push({
              title: 'Follow-up Recommended',
              description: `Follow up on your ${latestAnalysis.primary_symptom} symptoms`,
              dueIn: '7 days',
              type: 'upcoming'
            })
          }
        }
        
        // Add general health reminders
        reminders.push({
          title: 'Annual Physical Exam',
          description: 'Regular health check-up',
          dueIn: `${nextCheckupDays} days`,
          type: 'upcoming'
        })
        
        if (analyses && analyses.length > 0) {
          // Add medication reminder if there are analyses
          reminders.push({
            title: 'Medication Refill',
            description: analyses[0].primary_symptom === 'Headache' ? 'Pain reliever - 3 days left' : 'Medication - 3 days left',
            dueIn: '3 days',
            type: 'action'
          })
        }
        
        // Add health goal reminder
        reminders.push({
          title: 'Health Goal',
          description: 'Daily water intake: 6/8 glasses',
          dueIn: 'Today',
          type: 'ontrack'
        })
        
        setHealthReminders(reminders)
      } else {
        // Set default values for new users with no analyses
        setRecentAnalyses([])
        setHealthScore(0)
        setNextCheckupDays(30)
        setActivePrescriptions(0)
        
        // Set default reminders for new users
        setHealthReminders([
          {
            title: 'First Health Check',
            description: 'Complete your first symptom analysis',
            dueIn: 'Today',
            type: 'action'
          },
          {
            title: 'Set Up Profile',
            description: 'Complete your medical profile',
            dueIn: 'Today',
            type: 'action'
          },
          {
            title: 'Health Goal',
            description: 'Daily water intake: 6/8 glasses',
            dueIn: 'Today',
            type: 'ontrack'
          }
        ])
      }
    } catch (error) {
      console.error("Error loading user data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user || !userProfile) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Heart className="h-8 w-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">MediSense</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {userProfile.first_name}!</span>
              <Button variant="ghost" size="sm" onClick={() => router.push("/profile")}>
                <User className="h-4 w-4 mr-2" />
                Profile
              </Button>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Your Health Dashboard</h2>
          <p className="text-gray-600">Manage your health journey with personalized insights and recommendations</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Health Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{healthScore}%</div>
              <p className="text-xs text-gray-600">
                {recentAnalyses.length > 0 ? 'Based on your health data' : 'Complete a symptom analysis'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Consultations</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recentAnalyses.length}</div>
              <p className="text-xs text-gray-600">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Next Checkup</CardTitle>
              <Calendar className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{nextCheckupDays}</div>
              <p className="text-xs text-gray-600">Days remaining</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Medications</CardTitle>
              <Clock className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activePrescriptions}</div>
              <p className="text-xs text-gray-600">Active prescriptions</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push("/symptoms")}>
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <Stethoscope className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Symptom Analysis</CardTitle>
                  <CardDescription>Describe your symptoms for personalized recommendations</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Start Analysis</Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push("/hospitals")}>
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="bg-green-100 p-3 rounded-lg">
                  <MapPin className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle>Find Hospitals</CardTitle>
                  <CardDescription>Locate nearby hospitals and clinics</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                Find Nearby
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push("/profile")}>
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <User className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <CardTitle>Health Profile</CardTitle>
                  <CardDescription>Manage your medical history and preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="outline">
                View Profile
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Consultations History</CardTitle>
              <CardDescription>Your complete health interactions history</CardDescription>
            </CardHeader>
            <CardContent>
              {recentAnalyses.length > 0 ? (
                <div>
                  <div className="mb-4 flex justify-between items-center">
                    <p className="text-sm text-gray-600">{recentAnalyses.length} consultations found</p>
                  </div>
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                    {recentAnalyses.map((analysis) => (
                      <div
                        key={analysis.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={() => {
                          localStorage.setItem("current_analysis_id", analysis.id)
                          router.push("/analysis")
                        }}
                      >
                        <div>
                          <p className="font-medium">{analysis.primary_symptom} Analysis</p>
                          <p className="text-sm text-gray-600">
                            {new Date(analysis.created_at).toLocaleDateString()} - Severity: {analysis.severity} - Duration:{" "}
                            {analysis.duration}
                          </p>
                          {analysis.confidence_score && (
                            <p className="text-xs text-blue-600">Confidence: {analysis.confidence_score}%</p>
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="secondary">Completed</Badge>
                          <Button variant="ghost" size="sm">
                            View Results
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">No consultations found</div>
                  <Button variant="outline" onClick={() => router.push("/symptoms")} className="text-sm">
                    Start Your First Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Health Reminders</CardTitle>
              <CardDescription>Important health tasks and appointments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {healthReminders.length > 0 ? (
                healthReminders.map((reminder, index) => {
                  // Determine styling based on reminder type
                  let bgColor = "bg-orange-50";
                  let borderColor = "border-orange-200";
                  let textColor = "text-orange-600";
                  let badgeColor = "border-orange-300 text-orange-700";
                  let badgeText = "Upcoming";
                  
                  if (reminder.type === "action") {
                    bgColor = "bg-blue-50";
                    borderColor = "border-blue-200";
                    textColor = "text-blue-600";
                    badgeColor = "border-blue-300 text-blue-700";
                    badgeText = "Action Needed";
                  } else if (reminder.type === "ontrack") {
                    bgColor = "bg-green-50";
                    borderColor = "border-green-200";
                    textColor = "text-green-600";
                    badgeColor = "border-green-300 text-green-700";
                    badgeText = "On Track";
                  }
                  
                  return (
                    <div key={index} className={`flex items-center justify-between p-3 ${bgColor} rounded-lg border ${borderColor}`}>
                      <div>
                        <p className="font-medium">{reminder.title}</p>
                        <p className={`text-sm ${textColor}`}>{reminder.description}</p>
                        {reminder.dueIn && <p className={`text-xs ${textColor}`}>Due in {reminder.dueIn}</p>}
                      </div>
                      <Badge variant="outline" className={badgeColor}>
                        {badgeText}
                      </Badge>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-4">No health reminders</div>
                  <Button variant="outline" onClick={() => router.push("/symptoms")} className="text-sm">
                    Start Your First Analysis
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
