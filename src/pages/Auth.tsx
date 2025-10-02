import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { UserRole } from '@/types';
import { GraduationCap, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Check } from "lucide-react"
import { motion } from "framer-motion"

export function Auth() {
  const { signIn, signUp } = useAuth();
  const [loading, setLoading] = useState(false);

  const [signUpData, setSignUpData] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'student' as UserRole
  });

  const [signInData, setSignInData] = useState({
    email: '',
    password: ''
  });

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signUp(signUpData.email, signUpData.password, signUpData.role, signUpData.displayName);
      toast.success('Account created successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(signInData.email, signInData.password);
      toast.success('Signed in successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600 text-white mb-4">
            <Video className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">EduMeet</h1>
          <p className="text-slate-600">Professional Online Teaching Platform</p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <Card>
              <CardHeader>
                <CardTitle>Welcome Back</CardTitle>
                <CardDescription>Sign in to your account to continue</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signInData.email}
                      onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={signInData.password}
                      onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Join as a teacher or student</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={signUpData.displayName}
                      onChange={(e) => setSignUpData({ ...signUpData, displayName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@example.com"
                      value={signUpData.email}
                      onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signUpData.password}
                      onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-3">
                    <Label>I am a</Label>
                      <RadioGroup
                        value={signUpData.role}
                        onValueChange={(value) =>
                          setSignUpData({ ...signUpData, role: value as UserRole })
                        }
                        className="grid gap-4 sm:grid-cols-2"
                      >
                        {/* Student Card */}
                        <Label
                          htmlFor="student"
                          className={`relative cursor-pointer rounded-xl border p-5 shadow-sm transition hover:shadow-md 
                            ${signUpData.role === "student"
                              ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                              : "border-slate-200 bg-white dark:bg-slate-800"
                            }`}
                        >
                          <RadioGroupItem value="student" id="student" className="sr-only" />
                          
                          {/* Animated Checkmark */}
                          {signUpData.role === "student" && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute top-3 right-3 rounded-full bg-blue-600 p-1 text-white shadow"
                            >
                              <Check className="h-4 w-4" />
                            </motion.div>
                          )}
                      
                          <div className="flex flex-col items-center gap-3">
                            <GraduationCap className="w-9 h-9 text-blue-600" />
                            <div className="text-center">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                Student
                              </div>
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                Join classes and take quizzes
                              </div>
                            </div>
                          </div>
                        </Label>
                        
                        {/* Teacher Card */}
                        <Label
                          htmlFor="teacher"
                          className={`relative cursor-pointer rounded-xl border p-5 shadow-sm transition hover:shadow-md 
                            ${signUpData.role === "teacher"
                              ? "border-green-600 bg-green-50 dark:bg-green-950"
                              : "border-slate-200 bg-white dark:bg-slate-800"
                            }`}
                        >
                          <RadioGroupItem value="teacher" id="teacher" className="sr-only" />
                          
                          {/* Animated Checkmark */}
                          {signUpData.role === "teacher" && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute top-3 right-3 rounded-full bg-green-600 p-1 text-white shadow"
                            >
                              <Check className="h-4 w-4" />
                            </motion.div>
                          )}
                      
                          <div className="flex flex-col items-center gap-3">
                            <Video className="w-9 h-9 text-green-600" />
                            <div className="text-center">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                Teacher
                              </div>
                              <div className="text-sm text-slate-500 dark:text-slate-400">
                                Create and manage classes
                              </div>
                            </div>
                          </div>
                        </Label>
                      </RadioGroup>

                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}