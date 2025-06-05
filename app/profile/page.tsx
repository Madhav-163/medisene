"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, User, Shield, Bell, Heart, Save, Trash2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/lib/supabase-client"
import type { User as UserProfile, MedicalInfo, EmergencyContact, UserPreferences } from "@/lib/supabase"

export default function ProfilePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const { user, loading } = useAuth()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [medicalInfo, setMedicalInfo] = useState<MedicalInfo | null>(null)
  const [emergencyContact, setEmergencyContact] = useState<EmergencyContact | null>(null)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth")
      return
    }

    if (user) {
      loadProfileData()
    }
  }, [user, loading, router])

  const loadProfileData = async () => {
    if (!user) return

    try {
      // Load user profile
      const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single()

      if (profile) setUserProfile(profile)

      // Load medical info or create empty object
      const { data: medical } = await supabase.from("medical_info").select("*").eq("user_id", user.id).single()

      setMedicalInfo(
        medical || {
          id: "",
          user_id: user.id,
          allergies: "",
          medications: "",
          conditions: "",
          blood_type: "",
          height: "",
          weight: "",
          created_at: "",
          updated_at: "",
        },
      )

      // Load emergency contact or create empty object
      const { data: emergency } = await supabase.from("emergency_contacts").select("*").eq("user_id", user.id).single()

      setEmergencyContact(
        emergency || {
          id: "",
          user_id: user.id,
          name: "",
          phone: "",
          relationship: "",
          created_at: "",
          updated_at: "",
        },
      )

      // Load preferences or create defaults
      const { data: prefs } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).single()

      setPreferences(
        prefs || {
          id: "",
          user_id: user.id,
          notifications: true,
          email_updates: true,
          data_sharing: false,
          location_services: true,
          created_at: "",
          updated_at: "",
        },
      )
    } catch (error) {
      console.error("Error loading profile data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (section: keyof UserProfile, field: string, value: any) => {
    if (!userProfile) return

    setUserProfile((prev) => {
      if (!prev) return prev

      if (typeof prev[section] === "object" && prev[section] !== null) {
        return {
          ...prev,
          [section]: {
            ...(prev[section] as any),
            [field]: value,
          },
        }
      } else {
        return {
          ...prev,
          [section]: value,
        }
      }
    })
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!user || !userProfile) return

    setIsSaving(true)

    try {
      // Update user profile
      await supabase
        .from("users")
        .update({
          first_name: userProfile.first_name,
          last_name: userProfile.last_name,
          email: userProfile.email,
          phone: userProfile.phone,
          date_of_birth: userProfile.date_of_birth,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)

      // Update or insert medical info
      if (medicalInfo) {
        const { error: medicalError } = await supabase.from("medical_info").upsert(
          {
            user_id: user.id,
            allergies: medicalInfo.allergies,
            medications: medicalInfo.medications,
            conditions: medicalInfo.conditions,
            blood_type: medicalInfo.blood_type,
            height: medicalInfo.height,
            weight: medicalInfo.weight,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          },
        )

        if (medicalError) {
          console.error("Error updating medical info:", medicalError)
        }
      }

      // Update or insert emergency contact
      if (emergencyContact && emergencyContact.name && emergencyContact.phone) {
        const { error: emergencyError } = await supabase.from("emergency_contacts").upsert(
          {
            user_id: user.id,
            name: emergencyContact.name,
            phone: emergencyContact.phone,
            relationship: emergencyContact.relationship,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          },
        )

        if (emergencyError) {
          console.error("Error updating emergency contact:", emergencyError)
        }
      }

      // Update preferences
      if (preferences) {
        const { error: prefsError } = await supabase.from("user_preferences").upsert(
          {
            user_id: user.id,
            notifications: preferences.notifications,
            email_updates: preferences.email_updates,
            data_sharing: preferences.data_sharing,
            location_services: preferences.location_services,
          },
          {
            onConflict: "user_id",
          },
        )

        if (prefsError) {
          console.error("Error updating preferences:", prefsError)
        }
      }

      setHasChanges(false)
    } catch (error) {
      console.error("Error saving profile:", error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!userProfile) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center">
              <Button variant="ghost" onClick={() => router.push("/dashboard")} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <div className="flex items-center space-x-3">
                <User className="h-6 w-6 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">Profile Settings</h1>
              </div>
            </div>
            {hasChanges && (
              <Button onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="personal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="personal">Personal Info</TabsTrigger>
            <TabsTrigger value="medical">Medical Info</TabsTrigger>
            <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
          </TabsList>

          {/* Personal Information */}
          <TabsContent value="personal">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details and contact information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={userProfile.first_name}
                      onChange={(e) => handleInputChange("first_name" as keyof UserProfile, "", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={userProfile.last_name}
                      onChange={(e) => handleInputChange("last_name" as keyof UserProfile, "", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={userProfile.email}
                    onChange={(e) => handleInputChange("email" as keyof UserProfile, "", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={userProfile.phone}
                      onChange={(e) => handleInputChange("phone" as keyof UserProfile, "", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={userProfile.date_of_birth}
                      onChange={(e) => handleInputChange("date_of_birth" as keyof UserProfile, "", e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Medical Information */}
          <TabsContent value="medical">
            <Card>
              <CardHeader>
                <CardTitle>Medical Information</CardTitle>
                <CardDescription>Keep your medical history up to date for better recommendations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bloodType">Blood Type</Label>
                    <Input
                      id="bloodType"
                      placeholder="e.g., A+, O-, B+"
                      value={medicalInfo?.blood_type || ""}
                      onChange={(e) =>
                        setMedicalInfo((prev) => ({ ...prev, blood_type: e.target.value }) as MedicalInfo)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      placeholder="e.g., 5'8&quot;, 170cm"
                      value={medicalInfo?.height || ""}
                      onChange={(e) => setMedicalInfo((prev) => ({ ...prev, height: e.target.value }) as MedicalInfo)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Weight</Label>
                  <Input
                    id="weight"
                    placeholder="e.g., 150 lbs, 70 kg"
                    value={medicalInfo?.weight || ""}
                    onChange={(e) => setMedicalInfo((prev) => ({ ...prev, weight: e.target.value }) as MedicalInfo)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="allergies">Known Allergies</Label>
                  <Textarea
                    id="allergies"
                    placeholder="List any known allergies to medications, foods, or other substances"
                    value={medicalInfo?.allergies || ""}
                    onChange={(e) => setMedicalInfo((prev) => ({ ...prev, allergies: e.target.value }) as MedicalInfo)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="medications">Current Medications</Label>
                  <Textarea
                    id="medications"
                    placeholder="List all current medications, supplements, and vitamins"
                    value={medicalInfo?.medications || ""}
                    onChange={(e) =>
                      setMedicalInfo((prev) => ({ ...prev, medications: e.target.value }) as MedicalInfo)
                    }
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="conditions">Medical Conditions</Label>
                  <Textarea
                    id="conditions"
                    placeholder="List any chronic conditions, past surgeries, or significant medical history"
                    value={medicalInfo?.conditions || ""}
                    onChange={(e) => setMedicalInfo((prev) => ({ ...prev, conditions: e.target.value }) as MedicalInfo)}
                    rows={4}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergency Contact */}
          <TabsContent value="emergency">
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contact</CardTitle>
                <CardDescription>Provide emergency contact information for urgent situations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="emergencyName">Contact Name</Label>
                  <Input
                    id="emergencyName"
                    placeholder="Full name of emergency contact"
                    value={emergencyContact?.name || ""}
                    onChange={(e) =>
                      setEmergencyContact((prev) => ({ ...prev, name: e.target.value }) as EmergencyContact)
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Phone Number</Label>
                    <Input
                      id="emergencyPhone"
                      type="tel"
                      placeholder="Emergency contact phone"
                      value={emergencyContact?.phone || ""}
                      onChange={(e) =>
                        setEmergencyContact((prev) => ({ ...prev, phone: e.target.value }) as EmergencyContact)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="relationship">Relationship</Label>
                    <Input
                      id="relationship"
                      placeholder="e.g., Spouse, Parent, Sibling"
                      value={emergencyContact?.relationship || ""}
                      onChange={(e) =>
                        setEmergencyContact((prev) => ({ ...prev, relationship: e.target.value }) as EmergencyContact)
                      }
                    />
                  </div>
                </div>

                <Alert>
                  <Heart className="h-4 w-4" />
                  <AlertDescription>
                    This information will only be used in emergency situations and will be kept strictly confidential.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences */}
          <TabsContent value="preferences">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Bell className="h-5 w-5" />
                    <span>Notifications</span>
                  </CardTitle>
                  <CardDescription>Manage how you receive updates and reminders</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="notifications">Push Notifications</Label>
                      <p className="text-sm text-gray-600">Receive important health reminders and updates</p>
                    </div>
                    <Switch
                      id="notifications"
                      checked={preferences?.notifications || false}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, notifications: checked }) as UserPreferences)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="emailUpdates">Email Updates</Label>
                      <p className="text-sm text-gray-600">Get health tips and product updates via email</p>
                    </div>
                    <Switch
                      id="emailUpdates"
                      checked={preferences?.email_updates || false}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, email_updates: checked }) as UserPreferences)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <span>Privacy & Data</span>
                  </CardTitle>
                  <CardDescription>Control how your data is used and shared</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="dataSharing">Anonymous Data Sharing</Label>
                      <p className="text-sm text-gray-600">Help improve our AI by sharing anonymized health data</p>
                    </div>
                    <Switch
                      id="dataSharing"
                      checked={preferences?.data_sharing || false}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, data_sharing: checked }) as UserPreferences)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="locationServices">Location Services</Label>
                      <p className="text-sm text-gray-600">Allow location access to find nearby hospitals</p>
                    </div>
                    <Switch
                      id="locationServices"
                      checked={preferences?.location_services || false}
                      onCheckedChange={(checked) =>
                        setPreferences((prev) => ({ ...prev, location_services: checked }) as UserPreferences)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-red-600">Danger Zone</CardTitle>
                  <CardDescription>Irreversible actions that affect your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                  <p className="text-sm text-gray-600 mt-2">
                    This will permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
