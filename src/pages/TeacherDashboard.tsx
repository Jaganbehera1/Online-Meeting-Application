import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  updateDoc, 
  doc,
  Timestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Class, StudentAttendance } from '@/types';
import { LogOut, Plus, Video, Calendar, Users, BarChart, Clock, Play, Trash2, User, Eye, EyeOff, Share2, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { format, isAfter, isBefore } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export function TeacherDashboard() {
  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<{[key: string]: StudentAttendance[]}>({});
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  const [newClass, setNewClass] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    duration: 60,
    isImmediate: false
  });

  useEffect(() => {
    if (!currentUser) return;

    console.log('Fetching classes for teacher:', currentUser.uid);

    // Query for classes where teacherId matches current user
    const q = query(
      collection(db, 'classes'),
      where('teacherId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        console.log('Teacher classes snapshot:', snapshot.size);
        const classesData: Class[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          console.log('Teacher class data:', data);
          const classData: Class = {
            id: doc.id,
            title: data.title || 'Untitled Class',
            description: data.description || '',
            teacherId: data.teacherId,
            teacherName: data.teacherName || '',
            scheduledAt: data.scheduledAt?.toDate() || new Date(),
            duration: data.duration || 60,
            status: data.status || 'scheduled',
            roomId: data.roomId || '',
            createdAt: data.createdAt?.toDate() || new Date(),
            studentCount: data.studentCount || 0,
            isImmediate: data.isImmediate || false,
            students: data.students || []
          };
          classesData.push(classData);
        });
        
        setClasses(classesData);
        
        // Fetch attendance for all classes
        classesData.forEach(classItem => {
          fetchStudentAttendance(classItem.id);
        });
      },
      (error) => {
        console.error('Error fetching classes:', error);
        toast.error('Failed to load classes');
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const fetchStudentAttendance = async (classId: string) => {
    try {
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('classId', '==', classId)
      );
      
      const snapshot = await getDocs(attendanceQuery);
      const attendanceData: StudentAttendance[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        attendanceData.push({
          id: doc.id,
          classId: data.classId,
          studentId: data.studentId,
          studentName: data.studentName || 'Unknown Student',
          studentEmail: data.studentEmail,
          joinedAt: data.joinedAt?.toDate() || new Date(),
          leftAt: data.leftAt?.toDate(),
          duration: data.duration || 0,
          status: data.status || 'present'
        });
      });
      
      setStudentAttendance(prev => ({
        ...prev,
        [classId]: attendanceData
      }));
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      toast.error('You must be logged in to create a class');
      return;
    }

    setLoading(true);

    try {
      const scheduledDate = newClass.isImmediate ? new Date() : new Date(newClass.scheduledAt);
      
      // Validate scheduled date
      if (!newClass.isImmediate && scheduledDate <= new Date()) {
        toast.error('Scheduled time must be in the future');
        setLoading(false);
        return;
      }

      const classData = {
        title: newClass.title || 'New Class',
        description: newClass.description,
        teacherId: currentUser.uid,
        teacherName: currentUser.displayName || currentUser.email || 'Teacher',
        teacherEmail: currentUser.email,
        scheduledAt: Timestamp.fromDate(scheduledDate),
        duration: newClass.duration,
        status: newClass.isImmediate ? 'live' : 'scheduled',
        roomId: Math.random().toString(36).substring(2, 10), // Longer room ID for uniqueness
        createdAt: Timestamp.fromDate(new Date()),
        studentCount: 0,
        isImmediate: newClass.isImmediate,
        students: []
      };

      const docRef = await addDoc(collection(db, 'classes'), classData);
      console.log('Class created with ID:', docRef.id, 'Room ID:', classData.roomId);
      
      toast.success(newClass.isImmediate ? 'Live class started!' : 'Class created successfully!');
      setShowCreateDialog(false);
      setNewClass({ title: '', description: '', scheduledAt: '', duration: 60, isImmediate: false });
      
      // If immediate class, navigate to it
      if (newClass.isImmediate) {
        navigate(`/class/${classData.roomId}`);
      }
    } catch (error: any) {
      console.error('Error creating class:', error);
      toast.error(error.message || 'Failed to create class');
    } finally {
      setLoading(false);
    }
  };

  const handleStartClass = async (classItem: Class) => {
    if (!currentUser) return;

    try {
      console.log('Starting class:', classItem.id, 'Room:', classItem.roomId);
      
      // Update class status to live
      const classRef = doc(db, 'classes', classItem.id);
      await updateDoc(classRef, {
        status: 'live',
        startedAt: Timestamp.fromDate(new Date())
      });
      
      // Navigate using roomId
      navigate(`/class/${classItem.roomId}`);
    } catch (error: any) {
      console.error('Error starting class:', error);
      toast.error('Failed to start class');
    }
  };

  const handleEndClass = async (classItem: Class) => {
    if (!currentUser) return;

    try {
      const classRef = doc(db, 'classes', classItem.id);
      await updateDoc(classRef, {
        status: 'completed',
        endedAt: Timestamp.fromDate(new Date())
      });
      toast.success('Class ended successfully');
    } catch (error: any) {
      console.error('Error ending class:', error);
      toast.error('Failed to end class');
    }
  };

  const handleDeleteClass = async (classItem: Class) => {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
      const classRef = doc(db, 'classes', classItem.id);
      await updateDoc(classRef, {
        status: 'cancelled'
      });
      toast.success('Class deleted successfully');
    } catch (error: any) {
      console.error('Error deleting class:', error);
      toast.error('Failed to delete class');
    }
  };

  const toggleStudentView = (classId: string) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(classId)) {
        newSet.delete(classId);
      } else {
        newSet.add(classId);
      }
      return newSet;
    });
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
  const completedClasses = classes.filter(c => c.status === 'completed');
  // Removed unused cancelledClasses and missedClasses variables

  const getClassStatus = (classItem: Class) => {
    if (classItem.status === 'live') return 'live';
    if (classItem.status === 'completed') return 'completed';
    if (classItem.status === 'cancelled') return 'cancelled';
    
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
      scheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    return (
      <Badge variant="outline" className={variants[status] || variants.scheduled}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const totalStudents = Object.values(studentAttendance).reduce(
    (total, attendance) => total + attendance.length, 0
  );

  const activeStudents = liveClasses.reduce(
    (total, classItem) => total + (studentAttendance[classItem.id]?.length || 0), 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                  {currentUser?.displayName?.[0]?.toUpperCase() || 'T'}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Teacher Dashboard</h1>
                  <p className="text-sm text-slate-600 flex items-center gap-1">
                    <span>Welcome back,</span>
                    <span className="font-medium">{currentUser?.displayName || currentUser?.email}</span>
                  </p>
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-6 ml-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{liveClasses.length}</div>
                  <div className="text-xs text-slate-500">Live Now</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-700">{upcomingClasses.length}</div>
                  <div className="text-xs text-slate-500">Upcoming</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{activeStudents}</div>
                  <div className="text-xs text-slate-500">Active Students</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700 shadow-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Class
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="text-xl">Create New Class</DialogTitle>
                    <DialogDescription>
                      Schedule a future class or start one immediately with screen sharing
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateClass} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Class Title *</Label>
                      <Input
                        id="title"
                        value={newClass.title}
                        onChange={(e) => setNewClass({ ...newClass, title: e.target.value })}
                        placeholder="Introduction to React Hooks"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newClass.description}
                        onChange={(e) => setNewClass({ ...newClass, description: e.target.value })}
                        placeholder="What will students learn in this class?"
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isImmediate"
                        checked={newClass.isImmediate}
                        onChange={(e) => setNewClass({ ...newClass, isImmediate: e.target.checked, scheduledAt: '' })}
                        className="rounded border-slate-300"
                      />
                      <Label htmlFor="isImmediate" className="text-sm font-medium">
                        Start class immediately
                      </Label>
                    </div>

                    {!newClass.isImmediate && (
                      <div className="space-y-2">
                        <Label htmlFor="scheduledAt">Scheduled Date & Time *</Label>
                        <Input
                          id="scheduledAt"
                          type="datetime-local"
                          value={newClass.scheduledAt}
                          onChange={(e) => setNewClass({ ...newClass, scheduledAt: e.target.value })}
                          min={new Date().toISOString().slice(0, 16)}
                          required={!newClass.isImmediate}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="duration">Duration (minutes) *</Label>
                      <Input
                        id="duration"
                        type="number"
                        value={newClass.duration}
                        onChange={(e) => setNewClass({ ...newClass, duration: parseInt(e.target.value) || 60 })}
                        min={15}
                        max={480}
                        step={15}
                        required
                      />
                    </div>

                    {/* Screen Sharing Info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <Monitor className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                          <h4 className="font-medium text-blue-900 text-sm">Screen Sharing Feature</h4>
                          <p className="text-blue-700 text-xs mt-1">
                            When you start the class, you'll be able to share your screen with students. 
                            They will see exactly what you're presenting in real-time.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setShowCreateDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button 
                        type="submit" 
                        className="flex-1 bg-blue-600 hover:bg-blue-700"
                        disabled={loading}
                      >
                        {loading ? (
                          'Creating...'
                        ) : newClass.isImmediate ? (
                          <>
                            <Share2 className="w-4 h-4 mr-2" />
                            Start & Share Screen
                          </>
                        ) : (
                          'Schedule Class'
                        )}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={handleSignOut} className="border-slate-300">
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Debug Info - Remove in production */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <strong>Debug Info:</strong> Loaded {classes.length} classes. 
                Live: {liveClasses.length}, Upcoming: {upcomingClasses.length}, 
                Completed: {completedClasses.length}, Total Students: {totalStudents}
                <br />
                User: {currentUser?.uid}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-white to-blue-50 border-blue-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-blue-700">Total Classes</CardTitle>
              <Video className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{classes.length}</div>
              <p className="text-xs text-slate-600 mt-1">All time created classes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-red-50 border-red-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-red-700">Live Now</CardTitle>
              <Play className="h-5 w-5 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{liveClasses.length}</div>
              <p className="text-xs text-slate-600 mt-1">Active classes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-green-50 border-green-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-green-700">Active Students</CardTitle>
              <Users className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{activeStudents}</div>
              <p className="text-xs text-slate-600 mt-1">In live classes</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-purple-50 border-purple-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-purple-700">Screen Sharing</CardTitle>
              <Share2 className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{liveClasses.length}</div>
              <p className="text-xs text-slate-600 mt-1">Active shares</p>
            </CardContent>
          </Card>
        </div>

        {/* Classes Section */}
        <Card className="shadow-lg border-slate-200">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-2xl text-slate-900">My Classes</CardTitle>
                <CardDescription>
                  Manage your classes with real-time screen sharing and student tracking
                </CardDescription>
              </div>
              <div className="mt-4 sm:mt-0">
                <Button 
                  onClick={() => setShowCreateDialog(true)}
                  className="bg-blue-600 hover:bg-blue-700 shadow-md"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Class
                </Button>
              </div>
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
                  <BarChart className="w-4 h-4 mr-2" />
                  Completed ({completedClasses.length})
                </TabsTrigger>
                <TabsTrigger 
                  value="all" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-gray-500 data-[state=active]:bg-white py-4 px-6"
                >
                  <Users className="w-4 h-4 mr-2" />
                  All ({classes.length})
                </TabsTrigger>
              </TabsList>

              {/* Live Classes Tab */}
              <TabsContent value="live" className="p-6 space-y-4 m-0">
                {liveClasses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
                      <Play className="w-8 h-8 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Live Classes</h3>
                    <p className="text-slate-600 mb-4">You don't have any active classes right now</p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Share2 className="w-4 h-4 mr-2" />
                      Start Class with Screen Share
                    </Button>
                  </div>
                ) : (
                  liveClasses.map((classItem) => {
                    const students = studentAttendance[classItem.id] || [];
                    const isExpanded = expandedClasses.has(classItem.id);
                    
                    return (
                      <Card key={classItem.id} className="border-l-4 border-l-red-500 shadow-md">
                        <CardHeader>
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <CardTitle className="text-xl">{classItem.title}</CardTitle>
                                {getStatusBadge('live')}
                              </div>
                              <CardDescription className="text-base">{classItem.description}</CardDescription>
                            </div>
                            <div className="flex gap-2 mt-4 lg:mt-0">
                              <Button 
                                onClick={() => navigate(`/class/${classItem.roomId}`)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                <Video className="w-4 h-4 mr-2" />
                                Join Class
                              </Button>
                              <Button 
                                variant="outline" 
                                onClick={() => handleEndClass(classItem)}
                              >
                                End Class
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {/* Screen Sharing Info */}
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <Monitor className="w-5 h-5 text-red-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-red-900 text-sm">Screen Sharing Ready</h4>
                                <p className="text-red-700 text-xs mt-1">
                                  Click "Join Class" to start sharing your screen with students. 
                                  They will see your presentation in real-time.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2 bg-red-50 px-3 py-1 rounded-full">
                              <Clock className="w-4 h-4 text-red-600" />
                              Live Now - Room: {classItem.roomId}
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              {students.length} students watching
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {classItem.duration} minutes
                            </div>
                          </div>

                          {/* Student Attendance Section */}
                          <div className="border-t pt-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Students Watching ({students.length})
                              </h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStudentView(classItem.id)}
                                className="flex items-center gap-2"
                              >
                                {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                {isExpanded ? 'Hide' : 'Show'} Students
                              </Button>
                            </div>

                            {isExpanded && (
                              students.length > 0 ? (
                                <div className="grid gap-2">
                                  {students.map((student) => (
                                    <div
                                      key={student.id}
                                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-medium text-sm">
                                          {student.studentName[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="font-medium text-slate-900">{student.studentName}</p>
                                          <p className="text-xs text-slate-600">
                                            Watching since {format(student.joinedAt, 'h:mm a')}
                                          </p>
                                        </div>
                                      </div>
                                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                                        Watching
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-4 text-slate-500">
                                  <User className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                                  <p>No students have joined yet</p>
                                </div>
                              )
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
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
                    <p className="text-slate-600 mb-4">Schedule your next class to get started</p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Schedule Class
                    </Button>
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
                            <CardDescription className="text-base">{classItem.description}</CardDescription>
                          </div>
                          <div className="flex gap-2 mt-4 lg:mt-0">
                            <Button 
                              onClick={() => handleStartClass(classItem)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Share2 className="w-4 h-4 mr-2" />
                              Start & Share
                            </Button>
                            <Button 
                              variant="outline" 
                              size="icon"
                              onClick={() => handleDeleteClass(classItem)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Screen Sharing Preview */}
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <Monitor className="w-5 h-5 text-blue-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-blue-900 text-sm">Screen Sharing Ready</h4>
                                <p className="text-blue-700 text-xs mt-1">
                                  When you start this class, you'll be able to share your screen with students.
                                  They will see your presentation in real-time.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full">
                              <Calendar className="w-4 h-4 text-blue-600" />
                              {classItem.scheduledAt && format(classItem.scheduledAt, 'PPP p')}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {classItem.duration} minutes
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              {classItem.studentCount || 0} students enrolled
                            </div>
                            <div className="flex items-center gap-2">
                              Room ID: {classItem.roomId}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Completed Classes Tab */}
              <TabsContent value="completed" className="p-6 space-y-4 m-0">
                {completedClasses.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                      <BarChart className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Completed Classes</h3>
                    <p className="text-slate-600">Your completed classes will appear here</p>
                  </div>
                ) : (
                  completedClasses.map((classItem) => {
                    const students = studentAttendance[classItem.id] || [];
                    const isExpanded = expandedClasses.has(classItem.id);
                    
                    return (
                      <Card key={classItem.id} className="border-l-4 border-l-green-500">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <CardTitle>{classItem.title}</CardTitle>
                                {getStatusBadge('completed')}
                              </div>
                              <CardDescription>{classItem.description}</CardDescription>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleStudentView(classItem.id)}
                              className="flex items-center gap-2"
                            >
                              <Users className="w-4 h-4" />
                              {students.length}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {classItem.scheduledAt && format(classItem.scheduledAt, 'PPP')}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {classItem.duration} minutes
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              {students.length} students attended
                            </div>
                            <div className="flex items-center gap-2">
                              <Share2 className="w-4 h-4" />
                              Screen sharing completed
                            </div>
                          </div>

                          {isExpanded && students.length > 0 && (
                            <div className="border-t pt-4">
                              <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Attendance Summary
                              </h4>
                              <div className="grid gap-2">
                                {students.map((student) => (
                                  <div
                                    key={student.id}
                                    className="flex items-center justify-between p-2 bg-slate-50 rounded border"
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-medium">
                                        {student.studentName[0]?.toUpperCase()}
                                      </div>
                                      <span className="text-sm">{student.studentName}</span>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {format(student.joinedAt, 'h:mm a')}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>

              {/* All Classes Tab */}
              <TabsContent value="all" className="p-6 space-y-4 m-0">
                {classes.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <Users className="w-8 h-8 text-gray-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">No Classes Found</h3>
                    <p className="text-slate-600 mb-4">Create your first class to get started</p>
                    <Button onClick={() => setShowCreateDialog(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Class
                    </Button>
                  </div>
                ) : (
                  classes.map((classItem) => {
                    const students = studentAttendance[classItem.id] || [];
                    
                    return (
                      <Card key={classItem.id} className={`border-l-4 ${
                        classItem.status === 'live' ? 'border-l-red-500' :
                        classItem.status === 'completed' ? 'border-l-green-500' :
                        classItem.status === 'scheduled' ? 'border-l-blue-500' :
                        'border-l-gray-500'
                      }`}>
                        <CardHeader>
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <CardTitle className="text-lg">{classItem.title}</CardTitle>
                                {getStatusBadge(getClassStatus(classItem))}
                              </div>
                              <CardDescription>{classItem.description}</CardDescription>
                            </div>
                            <div className="flex items-center gap-2 mt-4 lg:mt-0">
                              <div className="flex items-center gap-1 text-sm text-slate-600">
                                <Users className="w-4 h-4" />
                                {students.length}
                              </div>
                              {classItem.status === 'scheduled' && (
                                <Button 
                                  onClick={() => handleStartClass(classItem)}
                                  size="sm"
                                >
                                  <Share2 className="w-4 h-4 mr-2" />
                                  Start
                                </Button>
                              )}
                              {classItem.status === 'live' && (
                                <Button 
                                  onClick={() => navigate(`/class/${classItem.roomId}`)}
                                  size="sm"
                                  variant="destructive"
                                >
                                  <Share2 className="w-4 h-4 mr-2" />
                                  Share
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              {classItem.scheduledAt && format(classItem.scheduledAt, 'PPP p')}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {classItem.duration} minutes
                            </div>
                            <div className="flex items-center gap-2">
                              Status: {classItem.status}
                            </div>
                            <div className="flex items-center gap-2">
                              <Share2 className="w-4 h-4" />
                              {students.length} viewers
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}