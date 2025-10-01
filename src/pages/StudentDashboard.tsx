import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { collection, query, onSnapshot, orderBy, where, Timestamp, limit, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Class, QuizResponse } from '@/types';
import { LogOut, Video, Calendar, BookOpen, Trophy, Users, Clock, Play, BarChart, Award, Monitor, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format, isAfter, isBefore } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function StudentDashboard() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResponse[]>([]);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [showQuizReview, setShowQuizReview] = useState(false);
  const [selectedQuizForReview, setSelectedQuizForReview] = useState<QuizResponse | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    console.log('Fetching classes for student:', currentUser.uid);
    
    // Only show classes that are live, upcoming, or recently completed
    const q = query(
      collection(db, 'classes'),
      where('status', 'in', ['live', 'scheduled']),
      orderBy('status'),
      orderBy('scheduledAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log('Classes snapshot received:', snapshot.size);
        const classesData: Class[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          console.log('Class data:', data);
          
          // Only include classes from the last 30 days
          const classDate = data.scheduledAt?.toDate();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          if (!classDate || classDate > thirtyDaysAgo) {
            const classData: Class = {
              id: doc.id,
              title: data.title || 'Untitled Class',
              description: data.description || '',
              teacherId: data.teacherId,
              teacherName: data.teacherName || 'Teacher',
              teacherEmail: data.teacherEmail,
              scheduledAt: data.scheduledAt?.toDate() || new Date(),
              duration: data.duration || 60,
              status: data.status || 'scheduled',
              roomId: data.roomId || '',
              createdAt: data.createdAt?.toDate() || new Date(),
              studentCount: data.studentCount || 0,
              isImmediate: data.isImmediate || false
            };
            classesData.push(classData);
          }
        });
        
        console.log('Processed classes:', classesData.length);
        setClasses(classesData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching classes:', error);
        toast.error('Failed to load classes');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'quizResponses'),
      where('studentId', '==', currentUser.uid),
      orderBy('submittedAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const responses: QuizResponse[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          const response: QuizResponse = {
            id: doc.id,
            studentId: data.studentId,
            studentName: data.studentName || currentUser.displayName || 'Student',
            quizId: data.quizId,
            quizTitle: data.quizTitle || 'Quiz',
            question: data.question || '',
            selectedOption: data.selectedOption || '',
            correctOption: data.correctOption || '',
            isCorrect: data.isCorrect || false,
            submittedAt: data.submittedAt?.toDate() || new Date(),
            classId: data.classId,
            score: data.score || 0,
            totalQuestions: data.totalQuestions || 1
          };
          responses.push(response);
        });
        
        setQuizResults(responses);
      },
      (error) => {
        console.error('Error fetching quiz results:', error);
        toast.error('Failed to load quiz results');
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleJoinClass = async (classItem: Class) => {
    if (classItem.status === 'live') {
      console.log('Joining class:', classItem.roomId);
      
      // Record attendance before navigating
      try {
        await addDoc(collection(db, 'attendance'), {
          classId: classItem.id,
          studentId: currentUser?.uid,
          studentName: currentUser?.displayName || currentUser?.email || 'Student',
          studentEmail: currentUser?.email,
          joinedAt: Timestamp.fromDate(new Date()),
          status: 'present'
        });
      } catch (error) {
        console.error('Error recording attendance:', error);
      }
      
      navigate(`/class/${classItem.roomId}`);
    } else {
      toast.info('This class has not started yet');
    }
  };

  const handleReviewQuiz = (quiz: QuizResponse) => {
    setSelectedQuizForReview(quiz);
    setShowQuizReview(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      toast.error('Failed to sign out');
    }
  };

  // Categorize classes
  const now = new Date();
  
  const liveClasses = classes.filter(c => c.status === 'live');
  const upcomingClasses = classes.filter(c => 
    c.status === 'scheduled' && 
    c.scheduledAt && 
    isAfter(c.scheduledAt, now)
  );
  const pastClasses = classes.filter(c => c.status === 'completed');
  const missedClasses = classes.filter(c => 
    c.status === 'scheduled' && 
    c.scheduledAt && 
    isBefore(c.scheduledAt, now)
  );

  // Quiz statistics
  const totalQuizzes = quizResults.length;
  const correctAnswers = quizResults.filter(r => r.isCorrect).length;
  const accuracy = totalQuizzes > 0 ? (correctAnswers / totalQuizzes) * 100 : 0;
  const averageScore = totalQuizzes > 0 
    ? quizResults.reduce((sum, result) => sum + (result.score || 0), 0) / totalQuizzes 
    : 0;

  const getClassStatus = (classItem: Class) => {
    if (classItem.status === 'live') return 'live';
    if (classItem.status === 'completed') return 'completed';
    
    if (classItem.scheduledAt) {
      if (isBefore(classItem.scheduledAt, now)) return 'missed';
      if (isAfter(classItem.scheduledAt, now)) return 'upcoming';
    }
    
    return 'scheduled';
  };

  const getStatusBadge = (status: string) => {
    const variants: { [key: string]: string } = {
      live: 'bg-red-100 text-red-800 border-red-200',
      upcoming: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      missed: 'bg-gray-100 text-gray-800 border-gray-200',
      scheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200'
    };

    return (
      <Badge variant="outline" className={variants[status] || variants.scheduled}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Get unique quizzes taken
  const uniqueQuizzes = [...new Set(quizResults.map(q => q.quizId))].length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {currentUser?.displayName?.[0]?.toUpperCase() || 'S'}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Student Dashboard</h1>
                  <p className="text-sm text-slate-600 flex items-center gap-1">
                    <span>Welcome back,</span>
                    <span className="font-medium">{currentUser?.displayName || currentUser?.email}</span>
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-6 ml-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{liveClasses.length}</div>
                  <div className="text-xs text-slate-500">Live Classes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{upcomingClasses.length}</div>
                  <div className="text-xs text-slate-500">Upcoming</div>
                </div>
              </div>
            </div>

            <Button variant="outline" onClick={handleSignOut} className="border-slate-300">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Debug Info - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <strong>Debug Info:</strong> Loaded {classes.length} classes, {quizResults.length} quiz responses
                <br />
                Live: {liveClasses.length}, Upcoming: {upcomingClasses.length}, User: {currentUser?.uid}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-white to-blue-50 border-blue-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-blue-700">Live Classes</CardTitle>
              <Video className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{liveClasses.length}</div>
              <p className="text-xs text-slate-600 mt-1">Available now</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-green-50 border-green-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-green-700">Upcoming</CardTitle>
              <Calendar className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{upcomingClasses.length}</div>
              <p className="text-xs text-slate-600 mt-1">Scheduled classes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-purple-50 border-purple-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-purple-700">Quizzes Taken</CardTitle>
              <BookOpen className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{totalQuizzes}</div>
              <p className="text-xs text-slate-600 mt-1">{uniqueQuizzes} unique quizzes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-orange-50 border-orange-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-orange-700">Accuracy</CardTitle>
              <Trophy className="h-5 w-5 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{Math.round(accuracy)}%</div>
              <p className="text-xs text-slate-600 mt-1">
                {correctAnswers}/{totalQuizzes} correct
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-4">
            <div>
              <CardTitle className="text-2xl text-slate-900">My Learning</CardTitle>
              <CardDescription>
                Join live classes, view upcoming sessions, and track your quiz performance
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-slate-50 p-0">
                <TabsTrigger 
                  value="live" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-red-500 data-[state=active]:bg-white py-4 px-6"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Live ({liveClasses.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="upcoming" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-white py-4 px-6"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Upcoming ({upcomingClasses.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="completed" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-green-500 data-[state=active]:bg-white py-4 px-6"
                >
                  <BookOpen className="w-4 h-4 mr-2" />
                  Completed ({pastClasses.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="results" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-white py-4 px-6"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Quiz Results ({quizResults.length})
                </TabsTrigger>
              </TabsList>

              {/* Live Classes Tab */}
              <TabsContent value="live" className="p-6 space-y-4 m-0">
                {liveClasses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                      <Video className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Live Classes</h3>
                    <p className="text-slate-600">There are no active classes at the moment</p>
                  </div>
                ) : (
                  liveClasses.map((classItem) => (
                    <Card key={classItem.id} className="border-l-4 border-l-red-500 shadow-md hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-xl">{classItem.title}</CardTitle>
                              {getStatusBadge('live')}
                            </div>
                            <CardDescription className="text-base mb-3">{classItem.description}</CardDescription>
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                {classItem.teacherName}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {classItem.duration} minutes
                              </div>
                              <div className="flex items-center gap-2">
                                <Monitor className="w-4 h-4" />
                                Screen Sharing Ready
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 lg:mt-0">
                            <Button 
                              onClick={() => handleJoinClass(classItem)}
                              className="bg-red-600 hover:bg-red-700 shadow-md"
                              size="lg"
                            >
                              <Video className="w-4 h-4 mr-2" />
                              Join Class
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Upcoming Classes Tab */}
              <TabsContent value="upcoming" className="p-6 space-y-4 m-0">
                {upcomingClasses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
                      <Calendar className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Upcoming Classes</h3>
                    <p className="text-slate-600">Check back later for new scheduled classes</p>
                  </div>
                ) : (
                  upcomingClasses.map((classItem) => (
                    <Card key={classItem.id} className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-xl">{classItem.title}</CardTitle>
                              {getStatusBadge(getClassStatus(classItem))}
                            </div>
                            <CardDescription className="text-base mb-3">{classItem.description}</CardDescription>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                {classItem.scheduledAt && format(classItem.scheduledAt, 'PPP p')}
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                {classItem.teacherName}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {classItem.duration} minutes
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 lg:mt-0">
                            <Button 
                              variant="outline"
                              onClick={() => handleJoinClass(classItem)}
                              disabled={classItem.status !== 'live'}
                            >
                              {classItem.status === 'live' ? 'Join Now' : 'Starts Soon'}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Completed Classes Tab */}
              <TabsContent value="completed" className="p-6 space-y-4 m-0">
                {pastClasses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Completed Classes</h3>
                    <p className="text-slate-600">Your completed classes will appear here</p>
                  </div>
                ) : (
                  pastClasses.map((classItem) => (
                    <Card key={classItem.id} className="border-l-4 border-l-green-500">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">{classItem.title}</CardTitle>
                              {getStatusBadge('completed')}
                            </div>
                            <CardDescription className="mb-3">{classItem.description}</CardDescription>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                {classItem.teacherName}
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {classItem.scheduledAt && format(classItem.scheduledAt, 'PPP')}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                {classItem.duration} minutes
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Quiz Results Tab */}
              <TabsContent value="results" className="p-6 space-y-4 m-0">
                {quizResults.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 flex items-center justify-center">
                      <Trophy className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Quiz Results</h3>
                    <p className="text-slate-600">Your quiz results will appear here after you take quizzes</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Quiz Summary */}
                    <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                      <CardContent className="p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-purple-700">{totalQuizzes}</div>
                            <div className="text-sm text-slate-600">Total Attempts</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-green-700">{correctAnswers}</div>
                            <div className="text-sm text-slate-600">Correct Answers</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-blue-700">{Math.round(accuracy)}%</div>
                            <div className="text-sm text-slate-600">Accuracy</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-orange-700">{Math.round(averageScore)}%</div>
                            <div className="text-sm text-slate-600">Avg Score</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Individual Results */}
                    {quizResults.map((result) => (
                      <Card key={result.id} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <CardTitle className="text-lg">{result.quizTitle}</CardTitle>
                                <Badge 
                                  variant={result.isCorrect ? "default" : "destructive"}
                                  className={result.isCorrect ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                                >
                                  {result.isCorrect ? 'Correct' : 'Incorrect'}
                                </Badge>
                              </div>
                              {result.question && (
                                <CardDescription className="text-base mb-2">
                                  <strong>Question:</strong> {result.question}
                                </CardDescription>
                              )}
                              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mt-3">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  Submitted {format(result.submittedAt, 'PPP p')}
                                </div>
                                {result.score !== undefined && (
                                  <div className="flex items-center gap-2">
                                    <Award className="w-4 h-4" />
                                    Score: {result.score}/{result.totalQuestions}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-4 lg:mt-0">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => handleReviewQuiz(result)}
                                className="flex items-center gap-2"
                              >
                                <Eye className="w-4 h-4" />
                                Review
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        {!result.isCorrect && result.correctOption && (
                          <CardContent className="pt-0">
                            <div className="text-sm text-slate-700">
                              <span className="font-medium">Correct answer:</span> {result.correctOption}
                            </div>
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Quiz Review Dialog */}
      <Dialog open={showQuizReview} onOpenChange={setShowQuizReview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quiz Review</DialogTitle>
            <DialogDescription>
              Review your quiz submission and see the correct answers
            </DialogDescription>
          </DialogHeader>
          {selectedQuizForReview && (
            <div className="space-y-6">
              <div className="p-4 bg-gray-50 rounded-lg border">
                <p className="font-medium text-gray-900 mb-2">{selectedQuizForReview.question}</p>
                <div className="space-y-3 mt-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        selectedQuizForReview.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {selectedQuizForReview.isCorrect ? '✓' : '✗'}
                      </div>
                      <span className="font-medium">Your Answer</span>
                    </div>
                    <span>{selectedQuizForReview.selectedOption}</span>
                  </div>
                  
                  {!selectedQuizForReview.isCorrect && (
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50 border-green-200">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                          ✓
                        </div>
                        <span className="font-medium text-green-700">Correct Answer</span>
                      </div>
                      <span className="text-green-700">{selectedQuizForReview.correctOption}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div>
                  <Badge 
                    variant={selectedQuizForReview.isCorrect ? "default" : "destructive"}
                    className={selectedQuizForReview.isCorrect ? "bg-green-100 text-green-800" : ""}
                  >
                    {selectedQuizForReview.isCorrect ? 'Correct' : 'Incorrect'}
                  </Badge>
                  <p className="text-sm text-gray-600 mt-1">
                    Submitted on {format(selectedQuizForReview.submittedAt, 'PPP p')}
                  </p>
                </div>
                <Button onClick={() => setShowQuizReview(false)}>
                  Close Review
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}