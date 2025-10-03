import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  doc, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  Timestamp, 
  getDocs, 
  limit,
  orderBy,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Class, Quiz, QuizResponse, StudentAttendance } from '@/types';
import { WebRTCManager } from '@/lib/WebRTCManager';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  ScreenShare, 
  ScreenShareOff,
  Users,
  MessageSquare,
  Award,
  CheckCircle2,
  XCircle,
  BarChart3,
  Copy,
  Monitor,
  Eye,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';
import { toast } from 'sonner';

// Enhanced Screen Share implementation
class EnhancedScreenShare {
  private localStream: MediaStream | null = null;
  private isSharing = false;

  async startScreenShare(): Promise<MediaStream> {
    try {
      console.log('Starting screen share...');
      
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'window',
          frameRate: { ideal: 30, max: 60 }
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      console.log('Screen share stream obtained:', this.localStream.id);
      this.isSharing = true;

      // Handle when user stops screen share via browser UI
      this.localStream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('Screen share track ended');
          this.stopScreenShare();
        });
      });

      return this.localStream;
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  stopScreenShare() {
    console.log('Stopping screen share...');
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    this.isSharing = false;
  }

  isScreenSharing(): boolean {
    return this.isSharing;
  }

  getStream(): MediaStream | null {
    return this.localStream;
  }
}

export function ClassRoom() {
  const { classId } = useParams<{ classId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [classData, setClassData] = useState<Class | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeTab, setActiveTab] = useState('main');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // WebRTC States
  const webRTCManager = useRef(new WebRTCManager());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set());
  const [isWebRTCInitialized, setIsWebRTCInitialized] = useState(false);

  // Quiz states
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showQuizResponseDialog, setShowQuizResponseDialog] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [quizResponses, setQuizResponses] = useState<QuizResponse[]>([]);
  const [dismissedQuizzes, setDismissedQuizzes] = useState<Set<string>>(new Set());
  
  // Student states
  const [students, setStudents] = useState<StudentAttendance[]>([]);
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [_localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenShareInstance = useRef(new EnhancedScreenShare());

  const [newQuiz, setNewQuiz] = useState({
    question: '',
    option1: '',
    option2: '',
    option3: '',
    option4: '',
    correctAnswer: 0
  });

  // Check if user is teacher based on class ownership
  const isTeacher = classData?.teacherId === currentUser?.uid;

  // Find class by roomId
  useEffect(() => {
    if (!classId) {
      toast.error('No class ID provided');
      navigate('/');
      return;
    }

    console.log('Looking for class with roomId:', classId);

    const findClassByRoomId = async () => {
      setLoading(true);
      try {
        const classesQuery = query(
          collection(db, 'classes'),
          where('roomId', '==', classId)
        );
        
        const querySnapshot = await getDocs(classesQuery);
        
        if (!querySnapshot.empty) {
          const classDoc = querySnapshot.docs[0];
          const data = classDoc.data();
          console.log('Found class:', data);
          
          const classDataObj: Class = {
            id: classDoc.id,
            ...data,
            scheduledAt: data.scheduledAt?.toDate(),
            createdAt: data.createdAt?.toDate(),
            startedAt: data.startedAt?.toDate(),
            endedAt: data.endedAt?.toDate()
          } as Class;
          setClassData(classDataObj);

          // Start class if teacher and scheduled
          if (classDataObj.teacherId === currentUser?.uid && classDataObj.status === 'scheduled') {
            console.log('Starting class as teacher');
            await updateDoc(doc(db, 'classes', classDoc.id), { 
              status: 'live',
              startedAt: Timestamp.fromDate(new Date())
            });
          }

          // Record student attendance
          if (classDataObj.teacherId !== currentUser?.uid) {
            console.log('Recording student attendance for student:', currentUser?.uid);
            const attendanceQuery = query(
              collection(db, 'attendance'),
              where('classId', '==', classDoc.id),
              where('studentId', '==', currentUser?.uid)
            );
            
            const attendanceSnapshot = await getDocs(attendanceQuery);
            
            if (attendanceSnapshot.empty) {
              await addDoc(collection(db, 'attendance'), {
                classId: classDoc.id,
                studentId: currentUser?.uid,
                studentName: currentUser?.displayName || currentUser?.email || 'Student',
                studentEmail: currentUser?.email,
                joinedAt: Timestamp.fromDate(new Date()),
                status: 'present'
              });
              console.log('Attendance recorded for student');
            }
          }
        } else {
          console.error('No class found with roomId:', classId);
          toast.error('Class not found. Please check the class link.');
          navigate(isTeacher ? '/teacher' : '/student');
        }
      } catch (error) {
        console.error('Error fetching class:', error);
        toast.error('Failed to load class');
        navigate(isTeacher ? '/teacher' : '/student');
      } finally {
        setLoading(false);
      }
    };

    findClassByRoomId();
  }, [classId, currentUser, navigate, isTeacher]);

// In ClassRoom.tsx - Replace the students useEffect
useEffect(() => {
  if (!classData?.id) return;

  console.log('Fetching students for class:', classData.id);

  const attendanceQuery = query(
    collection(db, 'attendance'),
    where('classId', '==', classData.id),
    orderBy('joinedAt', 'desc')
  );

  const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
    const studentsData: StudentAttendance[] = [];
    const uniqueStudentIds = new Set(); // Track unique student IDs
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      const studentId = data.studentId;
      
      // Only add if we haven't seen this student ID before
      if (!uniqueStudentIds.has(studentId)) {
        uniqueStudentIds.add(studentId);
        studentsData.push({
          id: doc.id,
          ...data,
          joinedAt: data.joinedAt?.toDate(),
          leftAt: data.leftAt?.toDate()
        } as StudentAttendance);
      } else {
        console.log('Skipping duplicate student:', studentId);
      }
    });
    
    console.log('Unique students loaded:', studentsData.length);
    setStudents(studentsData);
  });

  return () => unsubscribeAttendance();
}, [classData?.id]);
// Add this useEffect to track student's quiz responses
useEffect(() => {
  if (!activeQuiz?.id || !currentUser || isTeacher) return;

  // Check if student has already submitted this quiz
  const checkExistingResponse = async () => {
    try {
      const responseQuery = query(
        collection(db, 'quizResponses'),
        where('quizId', '==', activeQuiz.id),
        where('studentId', '==', currentUser.uid),
        limit(1)
      );

      const responseSnapshot = await getDocs(responseQuery);
      
      if (!responseSnapshot.empty) {
        const existingResponse = responseSnapshot.docs[0].data();
        setSelectedOption(existingResponse.selectedOption);
        setHasSubmitted(true);
        console.log('Student has already submitted this quiz');
      }
    } catch (error) {
      console.error('Error checking existing response:', error);
    }
  };

  checkExistingResponse();
}, [activeQuiz?.id, currentUser, isTeacher]);

  // Fetch active quizzes
  useEffect(() => {
    if (!classData?.id) return;

    console.log('Setting up quiz listener for class:', classData.id);

    const quizzesQuery = query(
      collection(db, 'quizzes'),
      where('classId', '==', classData.id),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      limit(1)
    );

    const unsubscribeQuizzes = onSnapshot(quizzesQuery, (snapshot) => {
      if (!snapshot.empty) {
        const quizDoc = snapshot.docs[0];
        const quizData = quizDoc.data();
        
        const activeQuizData: Quiz = {
          id: quizDoc.id,
          ...quizData,
          createdAt: quizData.createdAt?.toDate(),
        } as Quiz;
        
        setActiveQuiz(activeQuizData);
        console.log('Active quiz received:', activeQuizData.question);

        // Show quiz dialog to students automatically
        if (!isTeacher && !dismissedQuizzes.has(quizDoc.id)) {
          setShowQuizResponseDialog(true);
        }
      } else {
        setActiveQuiz(null);
      }
    }, (error) => {
      console.error('Error listening to quizzes:', error);
    });

    return () => unsubscribeQuizzes();
  }, [classData?.id, isTeacher, dismissedQuizzes]);

  // Fetch quiz responses
  useEffect(() => {
    if (!activeQuiz?.id || !isTeacher) return;

    const responsesQuery = query(
      collection(db, 'quizResponses'),
      where('quizId', '==', activeQuiz.id),
      orderBy('submittedAt', 'desc')
    );

    const unsubscribeResponses = onSnapshot(responsesQuery, (snapshot) => {
      const responses: QuizResponse[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        responses.push({
          id: doc.id,
          ...data,
          submittedAt: data.submittedAt?.toDate()
        } as QuizResponse);
      });
      setQuizResponses(responses);
    });

    return () => unsubscribeResponses();
  }, [activeQuiz?.id, isTeacher]);

  // WebRTC Signaling Listener
  useEffect(() => {
    if (!classData?.id || !currentUser) return;

    console.log('Setting up WebRTC signaling listener for class:', classData.id);

    const processedSignalIds = new Set<string>();
    const recentSignalKeys = new Map();

    const signalingQuery = query(
      collection(db, 'webrtcSignals'),
      where('classId', '==', classData.id),
      where('targetUserId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeSignaling = onSnapshot(signalingQuery, 
      async (snapshot) => {
        const now = Date.now();
        
        for (const docChange of snapshot.docChanges()) {
          if (docChange.type === 'added') {
            const signal = docChange.doc.data();
            const signalId = docChange.doc.id;
            
            // Skip if already processed
            if (processedSignalIds.has(signalId)) continue;
            processedSignalIds.add(signalId);
            
            // Create unique key and check for duplicates within 3 seconds
            const signalKey = `${signal.type}-${signal.fromUserId}`;
            const lastSignalTime = recentSignalKeys.get(signalKey) || 0;
            
            if (now - lastSignalTime < 3000) {
              console.log('Skipping duplicate signal:', signalKey);
              continue;
            }
            recentSignalKeys.set(signalKey, now);
            
            console.log('Processing WebRTC signal:', signal.type, 'from:', signal.fromUserId);
            await handleSignalingMessage(signal);
            
            // Clean up signal after processing
            try {
              await deleteDoc(doc(db, 'webrtcSignals', signalId));
            } catch (error) {
              console.error('Error deleting signal:', error);
            }
          }
        }
      },
      (error) => {
        console.error('Error listening to WebRTC signals:', error);
      }
    );

    return () => {
      unsubscribeSignaling();
      webRTCManager.current.closeAllConnections();
      webRTCManager.current.stopLocalStream();
    };
  }, [classData?.id, currentUser, isTeacher]);

  // Handle WebRTC signaling messages
  const handleSignalingMessage = async (signal: any) => {
    try {
      // Skip if this is our own signal
      if (signal.fromUserId === currentUser?.uid) return;

      console.log('Processing WebRTC signal:', signal.type, 'from:', signal.fromUserId);

      switch (signal.type) {
        case 'offer':
          if (!isTeacher) {
            console.log('Handling offer from teacher:', signal.fromUserId);
            
            try {
              const answer = await webRTCManager.current.handleOffer(signal.fromUserId, {
                type: signal.offer.type,
                sdp: signal.offer.sdp
              });
              
              await sendSignalingMessage({
                type: 'answer',
                fromUserId: currentUser?.uid,
                targetUserId: signal.fromUserId,
                answer: answer
              });
              
              console.log('Answer sent to teacher successfully');
            } catch (error) {
              console.error('Error handling teacher offer:', error);
            }
          }
          break;

        case 'answer':
          if (isTeacher) {
            console.log('Handling answer from student:', signal.fromUserId);
            
            try {
              await webRTCManager.current.handleAnswer(signal.fromUserId, {
                type: signal.answer.type,
                sdp: signal.answer.sdp
              });
            } catch (error) {
              console.error('Error handling student answer:', error);
            }
          }
          break;

        case 'ice-candidate':
          console.log('Handling ICE candidate from:', signal.fromUserId);
          await webRTCManager.current.addIceCandidate(signal.fromUserId, signal.candidate);
          break;

        case 'join-request':
          if (isTeacher) {
            console.log('Handling join request from student:', signal.fromUserId);
            
            // Check if we already have a healthy connection
            if (webRTCManager.current.isConnectionHealthy(signal.fromUserId)) {
              console.log('Already connected to student:', signal.fromUserId);
              return;
            }
            
            await initiateConnectionWithStudent(signal.fromUserId);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
    }
  };

  // Send signaling message
  const sendSignalingMessage = async (message: any) => {
    if (!classData || !currentUser) return;

    try {
      await addDoc(collection(db, 'webrtcSignals'), {
        ...message,
        classId: classData.id,
        createdAt: serverTimestamp()
      });
      console.log('Sent WebRTC signal:', message.type);
    } catch (error) {
      console.error('Error sending signaling message:', error);
    }
  };

  const initiateConnectionWithStudent = async (studentId: string) => {
    if (!isTeacher || !currentUser) return;

    try {
      console.log('Initiating connection with student:', studentId);
      const offer = await webRTCManager.current.createOffer(studentId);
      
      await sendSignalingMessage({
        type: 'offer',
        fromUserId: currentUser.uid,
        targetUserId: studentId,
        offer: offer
      });
      
      console.log('Offer sent successfully to student:', studentId);
    } catch (error) {
      console.error('Error initiating connection:', error);
      toast.error('Failed to connect with student');
    }
  };

  // Student join request
  const sendJoinRequest = useCallback(async () => {
    if (isTeacher || !classData || !currentUser) return;

    console.log('Sending join request to teacher');
    await sendSignalingMessage({
      type: 'join-request',
      fromUserId: currentUser.uid,
      targetUserId: classData.teacherId
    });
  }, [isTeacher, classData, currentUser]);

  // WebRTC Event Listeners
  useEffect(() => {
    const handleRemoteStreamAdded = (event: CustomEvent) => {
      const { studentId, stream } = event.detail;
      console.log('Remote stream added event:', studentId);
      setRemoteStreams(prev => new Map(prev).set(studentId, stream));
      
      // Update video element
      setTimeout(() => {
        const videoElement = remoteVideoRefs.current.get(studentId);
        if (videoElement && stream) {
          videoElement.srcObject = stream;
          console.log('Set remote stream for video element:', studentId);
        }
      }, 100);
    };

    const handleRemoteStreamRemoved = (event: CustomEvent) => {
      const { studentId } = event.detail;
      console.log('Remote stream removed event:', studentId);
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(studentId);
        return newMap;
      });
    };

    const handlePeerConnected = (event: CustomEvent) => {
      const { studentId } = event.detail;
      console.log('Peer connected event:', studentId);
      setActiveConnections(prev => new Set(prev).add(studentId));
      
      if (isTeacher) {
        toast.success(`Connected with student`);
      } else {
        toast.success('Connected with teacher');
      }
    };

    const handlePeerDisconnected = (event: CustomEvent) => {
      const { studentId } = event.detail;
      console.log('Peer disconnected event:', studentId);
      setActiveConnections(prev => {
        const newSet = new Set(prev);
        newSet.delete(studentId);
        return newSet;
      });
      setRemoteStreams(prev => {
        const newMap = new Map(prev);
        newMap.delete(studentId);
        return newMap;
      });
      
      if (isTeacher) {
        toast.info(`Student disconnected`);
      }
    };

    const handleIceCandidate = (event: CustomEvent) => {
      const { studentId, candidate } = event.detail;
      sendSignalingMessage({
        type: 'ice-candidate',
        fromUserId: currentUser?.uid,
        targetUserId: studentId,
        candidate: candidate
      });
    };

    window.addEventListener('remote-stream-added', handleRemoteStreamAdded as EventListener);
    window.addEventListener('remote-stream-removed', handleRemoteStreamRemoved as EventListener);
    window.addEventListener('peer-connected', handlePeerConnected as EventListener);
    window.addEventListener('peer-disconnected', handlePeerDisconnected as EventListener);
    window.addEventListener('ice-candidate', handleIceCandidate as EventListener);

    return () => {
      window.removeEventListener('remote-stream-added', handleRemoteStreamAdded as EventListener);
      window.removeEventListener('remote-stream-removed', handleRemoteStreamRemoved as EventListener);
      window.removeEventListener('peer-connected', handlePeerConnected as EventListener);
      window.removeEventListener('peer-disconnected', handlePeerDisconnected as EventListener);
      window.removeEventListener('ice-candidate', handleIceCandidate as EventListener);
    };
  }, [currentUser, isTeacher]);

  // Initialize WebRTC for teacher
  useEffect(() => {
    if (isTeacher) {
      const initializeTeacherMedia = async () => {
        try {
          await initializeMedia(true, true);
          console.log('Teacher media initialized successfully');
        } catch (error) {
          console.error('Failed to initialize teacher media:', error);
        }
      };
      initializeTeacherMedia();
    }
  }, [isTeacher]);

  // Student auto-join when class is loaded
  useEffect(() => {
    if (!isTeacher && classData && currentUser) {
      console.log('Student preparing to join class');
      
      const initializeStudentMedia = async () => {
        try {
          await initializeMedia(true, false);
          console.log('Student media initialized');
          
          // Send join request after a delay
          setTimeout(() => {
            sendJoinRequest();
          }, 2000);
        } catch (error) {
          console.error('Failed to initialize student media:', error);
          // Still try to send join request
          setTimeout(() => {
            sendJoinRequest();
          }, 2000);
        }
      };

      initializeStudentMedia();
    }
  }, [isTeacher, classData, currentUser, sendJoinRequest]);

  // Initialize media streams
  const initializeMedia = async (audio: boolean = true, video: boolean = true): Promise<boolean> => {
    try {
      setMediaError(null);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMediaError('Media devices not supported in this browser');
        return false;
      }

      console.log('Requesting media permissions for audio:', audio, 'video:', video);
      const stream = await webRTCManager.current.initializeLocalStream(audio, video);
      setLocalStream(stream);
      setIsWebRTCInitialized(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      setVideoEnabled(video);
      setAudioEnabled(audio);
      
      console.log('Media stream initialized successfully');
      return true;
      
    } catch (error: any) {
      console.error('Error accessing media devices:', error);
      
      if (error.name === 'NotAllowedError') {
        setMediaError('Camera/microphone access denied. Please allow permissions in your browser.');
      } else if (error.name === 'NotFoundError') {
        setMediaError('No camera/microphone found. Please connect a device to use these features.');
      } else {
        setMediaError('Failed to access camera/microphone. Please check your device permissions.');
      }
      return false;
    }
  };

  const toggleVideo = async () => {
    const newVideoState = !videoEnabled;
    
    if (!webRTCManager.current.isStreamInitialized()) {
      await initializeMedia(audioEnabled, true);
    } else {
      webRTCManager.current.updateLocalStreamTracks(audioEnabled, newVideoState);
    }
    
    setVideoEnabled(newVideoState);
    toast.success(newVideoState ? 'Camera turned on' : 'Camera turned off');
  };

  const toggleAudio = async () => {
    const newAudioState = !audioEnabled;
    
    if (!webRTCManager.current.isStreamInitialized()) {
      await initializeMedia(true, videoEnabled);
    } else {
      webRTCManager.current.updateLocalStreamTracks(newAudioState, videoEnabled);
    }
    
    setAudioEnabled(newAudioState);
    toast.success(newAudioState ? 'Microphone turned on' : 'Microphone turned off');
  };

  const handleStartScreenShare = async () => {
    try {
      console.log('Starting screen share...');
      
      const stream = await screenShareInstance.current.startScreenShare();
      setScreenStream(stream);
      setIsScreenSharing(true);

      if (screenShareRef.current) {
        screenShareRef.current.srcObject = stream;
      }

      // Record screen share in database for students
      if (isTeacher && classData) {
        try {
          await addDoc(collection(db, 'screenShares'), {
            classId: classData.id,
            teacherId: currentUser?.uid,
            teacherName: currentUser?.displayName || currentUser?.email,
            isActive: true,
            startedAt: Timestamp.fromDate(new Date())
          });
        } catch (dbError) {
          console.error('Error recording screen share:', dbError);
        }
      }

      toast.success('Screen sharing started');
      
    } catch (error) {
      console.error('Error starting screen share:', error);
      toast.error('Failed to start screen sharing');
    }
  };

  const handleStopScreenShare = async () => {
    console.log('Stopping screen share...');
    screenShareInstance.current.stopScreenShare();
    setScreenStream(null);
    setIsScreenSharing(false);

    if (isTeacher && classData) {
      try {
        const activeSharesQuery = query(
          collection(db, 'screenShares'),
          where('classId', '==', classData.id),
          where('isActive', '==', true),
          where('teacherId', '==', currentUser?.uid)
        );
        
        const activeShares = await getDocs(activeSharesQuery);
        const updatePromises = activeShares.docs.map(doc => 
          updateDoc(doc.ref, {
            isActive: false,
            endedAt: Timestamp.fromDate(new Date())
          })
        );
        
        await Promise.all(updatePromises);
      } catch (error) {
        console.error('Error cleaning up screen shares:', error);
      }
    }

    toast.info('Screen sharing stopped');
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!classData) return;

    try {
      const quizData = {
        classId: classData.id,
        teacherId: currentUser!.uid,
        teacherName: currentUser!.displayName || currentUser!.email,
        question: newQuiz.question,
        options: [newQuiz.option1, newQuiz.option2, newQuiz.option3, newQuiz.option4],
        correctAnswer: newQuiz.correctAnswer,
        createdAt: Timestamp.fromDate(new Date()),
        isActive: true
      };

      await addDoc(collection(db, 'quizzes'), quizData);
      toast.success('Quiz created successfully!');
      setShowQuizDialog(false);
      setNewQuiz({ question: '', option1: '', option2: '', option3: '', option4: '', correctAnswer: 0 });
    } catch (error: any) {
      toast.error('Failed to create quiz');
    }
  };

const handleSubmitQuizResponse = async () => {
  if (selectedOption === null || !activeQuiz || !classData || hasSubmitted) return;

  try {
    const responseData = {
      quizId: activeQuiz.id,
      classId: classData.id,
      studentId: currentUser!.uid,
      studentName: currentUser!.displayName || currentUser!.email || 'Student',
      selectedOption,
      isCorrect: selectedOption === activeQuiz.correctAnswer,
      submittedAt: Timestamp.fromDate(new Date()),
      question: activeQuiz.question,
      correctOption: activeQuiz.options[activeQuiz.correctAnswer],
      studentAnswer: activeQuiz.options[selectedOption]
    };

    await addDoc(collection(db, 'quizResponses'), responseData);
    toast.success('Answer submitted!');
    setHasSubmitted(true);
    
    // Don't automatically close the dialog - let student review
  } catch (error: any) {
    toast.error('Failed to submit answer');
  }
};

const handleQuizDialogClose = () => {
  if (activeQuiz && !isTeacher && hasSubmitted) {
    setDismissedQuizzes(prev => new Set(prev).add(activeQuiz.id));
  }
  setShowQuizResponseDialog(false);
  // Don't reset selected option if already submitted
  if (!hasSubmitted) {
    setSelectedOption(null);
  }
};

const handleReopenQuiz = () => {
  if (activeQuiz) {
    setShowQuizResponseDialog(true);
    setDismissedQuizzes(prev => {
      const newSet = new Set(prev);
      newSet.delete(activeQuiz.id);
      return newSet;
    });
  }
};

  const handleCloseQuiz = async () => {
    if (!activeQuiz) return;

    try {
      await updateDoc(doc(db, 'quizzes', activeQuiz.id), { isActive: false });
      toast.success('Quiz closed');
      setShowResultsDialog(true);
    } catch (error: any) {
      toast.error('Failed to close quiz');
    }
  };

  const handleEndClass = async () => {
    if (!classData) return;

    try {
      await updateDoc(doc(db, 'classes', classData.id), { 
        status: 'completed',
        endedAt: Timestamp.fromDate(new Date())
      });
      
      // Stop all media streams
      webRTCManager.current.stopLocalStream();
      webRTCManager.current.closeAllConnections();
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      screenShareInstance.current.stopScreenShare();
      
      toast.success('Class ended successfully');
      navigate(isTeacher ? '/teacher' : '/student');
    } catch (error: any) {
      toast.error('Failed to end class');
    }
  };

  const copyClassLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Class link copied to clipboard');
  };

  const retryMedia = () => {
    initializeMedia(audioEnabled, videoEnabled);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('Cleaning up classroom resources');
      webRTCManager.current.stopLocalStream();
      webRTCManager.current.closeAllConnections();
      screenShareInstance.current.stopScreenShare();
    };
  }, []);

  // Monitor screen shares for students
  useEffect(() => {
    if (!classData?.id || isTeacher) return;

    const screenSharesQuery = query(
      collection(db, 'screenShares'),
      where('classId', '==', classData.id),
      where('isActive', '==', true),
      orderBy('startedAt', 'desc'),
      limit(1)
    );

    const unsubscribeScreenShares = onSnapshot(screenSharesQuery, (snapshot) => {
      setIsScreenShareActive(!snapshot.empty);
    });

    return () => unsubscribeScreenShares();
  }, [classData?.id, isTeacher]);

  const correctCount = quizResponses.filter(r => r.isCorrect).length;
  const totalResponses = quizResponses.length;
  const accuracy = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;

  const canReopenQuiz = !isTeacher && activeQuiz && dismissedQuizzes.has(activeQuiz.id) && !hasSubmitted;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading classroom...</p>
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Class not found</p>
          <Button onClick={() => navigate(isTeacher ? '/teacher' : '/student')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-blue-600 text-white">
                {currentUser?.displayName?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-semibold">{classData.title}</h1>
              <p className="text-sm text-gray-300">
                with {classData.teacherName} • {classData.status?.toUpperCase()}
                {isScreenShareActive && !isTeacher && ' • SCREEN SHARING'}
                {activeQuiz && !isTeacher && ' • QUIZ ACTIVE'}
                {isTeacher && ` • ${activeConnections.size} CONNECTED`}
              </p>
            </div>
          </div>
          
          <Button variant="ghost" size="sm" onClick={copyClassLink} className="text-gray-300 hover:text-white">
            <Copy className="w-4 h-4 mr-2" />
            Copy Link
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-gray-700 px-3 py-1 rounded-full">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">{students.length}</span>
          </div>
          
          {isTeacher && (
            <div className="flex items-center gap-2 bg-green-700 px-3 py-1 rounded-full">
              <Wifi className="w-4 h-4" />
              <span className="text-sm font-medium">{activeConnections.size} connected</span>
            </div>
          )}
          
          {isScreenShareActive && (
            <Badge variant="secondary" className="bg-green-500 text-white">
              <ScreenShare className="w-3 h-3 mr-1" />
              Sharing
            </Badge>
          )}
          
          {activeQuiz && isTeacher && (
            <Badge variant="secondary" className="bg-yellow-500 text-white">
              <Award className="w-3 h-3 mr-1" />
              Quiz Active
            </Badge>
          )}

          {canReopenQuiz && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReopenQuiz}
              className="bg-yellow-500 text-white border-yellow-500 hover:bg-yellow-600"
            >
              <Award className="w-3 h-3 mr-1" />
              View Quiz
            </Button>
          )}
          
          <Button variant="destructive" onClick={handleEndClass} size="sm">
            {isTeacher ? 'End Class' : 'Leave'}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Video/Screen Share Area */}
        <div className="flex-1 p-6">
          {isScreenSharing && isTeacher ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ScreenShare className="w-5 h-5 text-green-500" />
                  <span className="font-semibold">You are sharing your screen</span>
                </div>
                <Button variant="destructive" onClick={handleStopScreenShare} size="sm">
                  <ScreenShareOff className="w-4 h-4 mr-2" />
                  Stop Sharing
                </Button>
              </div>
              <div className="flex-1 bg-black rounded-xl overflow-hidden relative">
                <video
                  ref={screenShareRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-sm">
                  Sharing your screen with {students.length} students
                </div>
              </div>
            </div>
          ) : isScreenShareActive && !isTeacher ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <ScreenShare className="w-5 h-5 text-green-500" />
                  <span className="font-semibold">
                    {classData.teacherName} is sharing their screen
                  </span>
                </div>
                <Badge variant="secondary" className="bg-green-500 text-white">
                  LIVE
                </Badge>
              </div>
              <div className="flex-1 bg-black rounded-xl overflow-hidden relative border-2 border-green-500">
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <div className="text-center text-white p-8">
                    <Monitor className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Watching {classData.teacherName}'s Screen</h3>
                    <p className="text-gray-300 mb-4">
                      The teacher is sharing their screen in real-time
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Live Screen Sharing Active
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isTeacher ? (
            <div className="h-full flex flex-col">
              {/* Teacher's Local Video and Controls */}
              <div className="mb-4">
                <Card className="bg-gray-800 border-gray-700">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>Your Video & Audio</span>
                      <div className="flex gap-2">
                        <Button
                          variant={videoEnabled ? "default" : "secondary"}
                          size="sm"
                          onClick={toggleVideo}
                          disabled={!!mediaError}
                        >
                          {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                        </Button>
                        <Button
                          variant={audioEnabled ? "default" : "secondary"}
                          size="sm"
                          onClick={toggleAudio}
                          disabled={!!mediaError}
                        >
                          {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {mediaError ? (
                      <div className="text-center p-4 bg-gray-700 rounded-lg">
                        <VideoOff className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-300 mb-2">{mediaError}</p>
                        <Button onClick={retryMedia} size="sm" variant="outline">
                          Retry
                        </Button>
                      </div>
                    ) : (
                      <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
                        />
                        {!videoEnabled && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                            <VideoOff className="w-12 h-12 text-gray-500" />
                            <span className="ml-2 text-gray-400">Camera off</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Students' Videos Grid */}
              {remoteStreams.size > 0 && (
                <div className="mb-4">
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Students ({remoteStreams.size}/{students.length} connected)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from(remoteStreams.entries()).map(([studentId, stream]) => {
                          const student = students.find(s => s.studentId === studentId);
                          const isConnected = activeConnections.has(studentId);
                          
                          return (
                            <div key={studentId} className="relative bg-black rounded-lg overflow-hidden aspect-video">
                              <video
                                ref={el => {
                                  if (el) {
                                    remoteVideoRefs.current.set(studentId, el);
                                    el.srcObject = stream;
                                  }
                                }}
                                autoPlay
                                playsInline
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                                <div className="flex items-center gap-1">
                                  {isConnected ? (
                                    <Wifi className="w-3 h-3 text-green-400" />
                                  ) : (
                                    <WifiOff className="w-3 h-3 text-red-400" />
                                  )}
                                  {student?.studentName || 'Student'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Screen Share Option */}
              <div className="flex-1 flex flex-col items-center justify-center bg-gray-800 rounded-xl p-8">
                <ScreenShare className="w-24 h-24 text-gray-500 mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Ready to present?</h2>
                <p className="text-gray-400 text-center mb-6 max-w-md">
                  Start screen sharing to show your presentation to all students.
                </p>
                <Button 
                  onClick={handleStartScreenShare} 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ScreenShare className="w-5 h-5 mr-2" />
                  Share Screen
                </Button>
              </div>
            </div>
          ) : (
            /* Student View */
            <div className="h-full flex flex-col">
              {/* Teacher's Video for Students */}
              {remoteStreams.size > 0 ? (
                <div className="mb-4">
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Video className="w-4 h-4 text-green-400" />
                        {classData.teacherName}'s Video
                        <Badge variant="secondary" className="bg-green-500 text-white">
                          LIVE
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4">
                        {Array.from(remoteStreams.entries()).map(([teacherId, stream]) => (
                          <div key={teacherId} className="relative aspect-video bg-black rounded-lg overflow-hidden">
                            <video
                              ref={el => {
                                if (el) {
                                  remoteVideoRefs.current.set(teacherId, el);
                                  el.srcObject = stream;
                                }
                              }}
                              autoPlay
                              playsInline
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                              {classData.teacherName} (Teacher)
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="mb-4 text-center py-8 bg-gray-800 rounded-xl">
                  <User className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Waiting for teacher</h3>
                  <p className="text-gray-400">The teacher's video will appear here when they start streaming</p>
                </div>
              )}

              {/* Student's Own Video (if enabled) */}
              {isWebRTCInitialized && (
                <div className="mb-4">
                  <Card className="bg-gray-800 border-gray-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Your Video</span>
                        <div className="flex gap-2">
                          <Button
                            variant={videoEnabled ? "default" : "secondary"}
                            size="sm"
                            onClick={toggleVideo}
                          >
                            {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                          </Button>
                          <Button
                            variant={audioEnabled ? "default" : "secondary"}
                            size="sm"
                            onClick={toggleAudio}
                          >
                            {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover ${!videoEnabled ? 'hidden' : ''}`}
                        />
                        {!videoEnabled && (
                          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                            <VideoOff className="w-12 h-12 text-gray-500" />
                            <span className="ml-2 text-gray-400">Your camera is off</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Waiting for Screen Share */}
              {!isScreenShareActive && (
                <div className="flex-1 flex flex-col items-center justify-center bg-gray-800 rounded-xl p-8">
                  <Monitor className="w-24 h-24 text-gray-500 mb-4" />
                  <h2 className="text-2xl font-semibold mb-2">Waiting for presenter</h2>
                  <p className="text-gray-400 text-center max-w-md">
                    The teacher will start sharing their screen shortly.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-3 p-2">
              <TabsTrigger value="main" className="text-xs">
                <Users className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-xs">
                <MessageSquare className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="activities" className="text-xs">
                <Award className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>

            <TabsContent value="main" className="flex-1 p-4 space-y-4">
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Participants ({students.length})</span>
                    {isTeacher && (
                      <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                        {activeConnections.size} connected
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {students.map((student) => {
                      const isConnected = activeConnections.has(student.studentId);
                      const hasVideo = remoteStreams.has(student.studentId);
                      
                      return (
                        <div key={student.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-600 transition-colors">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className={`text-xs ${
                              isConnected ? 'bg-green-600' : 'bg-gray-600'
                            }`}>
                              {student.studentName?.[0]?.toUpperCase() || 'S'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">
                                {student.studentName}
                                {student.studentId === classData?.teacherId && (
                                  <Badge variant="outline" className="ml-2 bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                                    Host
                                  </Badge>
                                )}
                              </p>
                              {isConnected && (
                                <div className="flex items-center gap-1">
                                  <Wifi className="w-3 h-3 text-green-400" />
                                  {hasVideo && <Video className="w-3 h-3 text-blue-400" />}
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-gray-400">
                              Joined {student.joinedAt ? new Date(student.joinedAt).toLocaleTimeString() : 'recently'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {isTeacher && (
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Class Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Button 
                      onClick={() => setShowQuizDialog(true)}
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                    >
                      <Award className="w-4 h-4 mr-2" />
                      Create Quiz
                    </Button>
                    {activeQuiz && (
                      <Button 
                        onClick={() => setShowResultsDialog(true)}
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start"
                      >
                        <BarChart3 className="w-4 h-4 mr-2" />
                        View Results ({totalResponses})
                      </Button>
                    )}
                    <Button 
                      onClick={handleStartScreenShare}
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start"
                      disabled={isScreenSharing}
                    >
                      <ScreenShare className="w-4 h-4 mr-2" />
                      {isScreenSharing ? 'Sharing...' : 'Share Screen'}
                    </Button>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant={videoEnabled ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleVideo}
                        className="flex-1"
                      >
                        {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant={audioEnabled ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleAudio}
                        className="flex-1"
                      >
                        {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {!isTeacher && (
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Your Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant={videoEnabled ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleVideo}
                        className="flex-1"
                        disabled={!isWebRTCInitialized}
                      >
                        {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant={audioEnabled ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleAudio}
                        className="flex-1"
                        disabled={!isWebRTCInitialized}
                      >
                        {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                    </div>
                    
                    {mediaError && (
                      <div className="text-xs text-red-400 bg-red-400/10 p-2 rounded">
                        {mediaError}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!isTeacher && activeQuiz && (
                <Card className="bg-gray-700 border-gray-600">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Award className="w-4 h-4 text-yellow-400" />
                      {hasSubmitted ? 'Quiz Completed' : 'Quiz Available'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!hasSubmitted && !dismissedQuizzes.has(activeQuiz.id) ? (
                      <Button 
                        onClick={() => setShowQuizResponseDialog(true)}
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                      >
                        <Award className="w-4 h-4 mr-2" />
                        Answer Quiz Question
                      </Button>
                    ) : (
                      <>
                        <Button 
                          onClick={handleReopenQuiz}
                          variant="outline" 
                          size="sm" 
                          className="w-full justify-start"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Quiz Result
                        </Button>
                        <div className="text-xs text-gray-400 text-center">
                          {hasSubmitted 
                            ? 'You have submitted your answer' 
                            : 'Quiz completed'
                          }
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="bg-gray-700 border-gray-600">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Class Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-gray-600 p-3 rounded">
                      <p className="text-2xl font-bold text-blue-400">{students.length}</p>
                      <p className="text-xs text-gray-400">Students</p>
                    </div>
                    <div className="bg-gray-600 p-3 rounded">
                      <p className="text-2xl font-bold text-green-400">{accuracy}%</p>
                      <p className="text-xs text-gray-400">Quiz Accuracy</p>
                    </div>
                  </div>
                  {isTeacher && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Connected:</span>
                        <span className="text-green-400">{activeConnections.size}/{students.length}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="flex-1 flex flex-col">
              <div className="flex-1 p-4">
                <div className="text-center text-gray-500 py-8">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2" />
                  <p>Chat feature coming soon</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activities" className="flex-1 p-4">
              <Card className="bg-gray-700 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-sm">Recent Activities</CardTitle>
                </CardHeader>
                <CardContent>
                  {activeQuiz ? (
                    <div className="space-y-3">
                      <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-4 h-4 text-yellow-400" />
                          <span className="font-medium text-yellow-400">Active Quiz</span>
                        </div>
                        <p className="text-sm text-gray-300 mb-2">{activeQuiz.question}</p>
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{totalResponses} responses</span>
                          <span>{accuracy}% accuracy</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <Award className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">No active activities</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Quiz Creation Dialog */}
      <Dialog open={showQuizDialog} onOpenChange={setShowQuizDialog}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-400" />
              Create Quiz
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a multiple-choice quiz for your students
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateQuiz} className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="question" className="text-sm font-medium text-gray-300">
                Question *
              </Label>
              <Textarea
                id="question"
                value={newQuiz.question}
                onChange={(e) => setNewQuiz({...newQuiz, question: e.target.value})}
                placeholder="Enter your quiz question here..."
                className="bg-gray-700 border-gray-600 text-white min-h-[100px]"
                required
              />
            </div>

            <div className="space-y-4">
              <Label className="text-sm font-medium text-gray-300">
                Quiz Options *
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((num) => (
                  <div key={num} className="space-y-2">
                    <Label htmlFor={`option${num}`} className="text-sm font-medium text-gray-300">
                      Option {num} *
                    </Label>
                    <Input
                      id={`option${num}`}
                      value={newQuiz[`option${num}` as keyof typeof newQuiz] as string}
                      onChange={(e) => setNewQuiz({...newQuiz, [`option${num}`]: e.target.value})}
                      placeholder={`Enter option ${num}`}
                      className="bg-gray-700 border-gray-600 text-white"
                      required
                    />
                  </div>
                ))}
              </div>
            </div>
              
            <div className="space-y-4">
              <Label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                Correct Answer *
              </Label>
              
              <RadioGroup 
                value={newQuiz.correctAnswer.toString()} 
                onValueChange={(value) => setNewQuiz({...newQuiz, correctAnswer: parseInt(value)})}
                className="grid grid-cols-2 gap-3"
              >
                {[1, 2, 3, 4].map((num) => (
                  <div 
                    key={num} 
                    className={`
                      relative flex items-center space-x-3 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                      ${newQuiz.correctAnswer === num - 1 
                        ? 'bg-green-500/20 border-green-500' 
                        : 'bg-gray-700/80 border-gray-600 hover:bg-gray-600/80'
                      }
                    `}
                  >
                    <RadioGroupItem 
                      value={(num - 1).toString()} 
                      id={`correct${num}`}
                      className="sr-only"
                    />
                    <Label 
                      htmlFor={`correct${num}`} 
                      className={`
                        flex-1 text-sm font-medium cursor-pointer select-none
                        ${newQuiz.correctAnswer === num - 1 ? 'text-green-300' : 'text-gray-300'}
                      `}
                    >
                      Option {num}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowQuizDialog(false)}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!newQuiz.question || !newQuiz.option1 || !newQuiz.option2 || !newQuiz.option3 || !newQuiz.option4}
              >
                <Award className="w-4 h-4 mr-2" />
                Create Quiz
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quiz Response Dialog */}
      <Dialog open={showQuizResponseDialog} onOpenChange={handleQuizDialogClose}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="w-5 h-5 text-yellow-400" />
              {hasSubmitted ? 'Quiz Review' : 'Quick Quiz'}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {hasSubmitted 
                ? 'Review your submitted answer' 
                : 'Answer the question below - You can only submit once'
              }
            </DialogDescription>
          </DialogHeader>
            
          {activeQuiz && (
            <div className="space-y-4">
              <div className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                <p className="font-medium text-white">{activeQuiz.question}</p>
              </div>
          
              <div className="space-y-3">
                {activeQuiz.options.map((option, index) => {
                  const isStudentAnswer = index === selectedOption;
                  const isCorrectAnswer = index === activeQuiz.correctAnswer;
                  const isStudentCorrect = hasSubmitted && isStudentAnswer && isCorrectAnswer;
                  const isStudentWrong = hasSubmitted && isStudentAnswer && !isCorrectAnswer;
                  const showCorrectAnswer = hasSubmitted && isCorrectAnswer && !isStudentCorrect;
                
                  return (
                    <div 
                      key={index} 
                      className={`
                        relative flex items-start space-x-3 p-4 rounded-xl border-2 transition-all duration-200
                        ${hasSubmitted 
                          ? isCorrectAnswer 
                            ? 'bg-green-500/20 border-green-500/80 shadow-lg shadow-green-500/20' 
                            : isStudentWrong
                              ? 'bg-red-500/20 border-red-500/80 shadow-lg shadow-red-500/20'
                              : showCorrectAnswer
                                ? 'bg-green-500/10 border-green-500/40'
                                : 'bg-gray-700/50 border-gray-600/50'
                          : 'bg-gray-700/80 border-gray-600 hover:bg-gray-600/80 hover:border-gray-500'
                        }
                        ${!hasSubmitted && !dismissedQuizzes.has(activeQuiz.id) && 'cursor-pointer'}
                      `}
                      onClick={() => !hasSubmitted && !dismissedQuizzes.has(activeQuiz.id) && setSelectedOption(index)}
                    >
                      <div className="flex items-center h-5 mt-0.5">
                        {hasSubmitted ? (
                          <>
                            {isCorrectAnswer && (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            )}
                            {isStudentWrong && (
                              <XCircle className="w-5 h-5 text-red-500" />
                            )}
                            {!isCorrectAnswer && !isStudentWrong && (
                              <div className="w-5 h-5 border-2 border-gray-500 rounded-full" />
                            )}
                          </>
                        ) : (
                          <div className={`
                            w-5 h-5 border-2 rounded-full flex items-center justify-center
                            ${selectedOption === index 
                              ? 'border-blue-500 bg-blue-500/20' 
                              : 'border-gray-400'
                            }
                            ${dismissedQuizzes.has(activeQuiz.id) ? 'opacity-50 cursor-not-allowed' : ''}
                          `}>
                            {selectedOption === index && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className={`
                          text-base font-medium select-none
                          ${hasSubmitted 
                            ? isCorrectAnswer 
                              ? 'text-green-400' 
                              : isStudentWrong
                                ? 'text-red-400'
                                : showCorrectAnswer
                                  ? 'text-green-300'
                                  : 'text-gray-400'
                            : selectedOption === index 
                              ? 'text-blue-300'
                              : 'text-gray-300'
                          }
                          ${dismissedQuizzes.has(activeQuiz.id) && !hasSubmitted ? 'opacity-50' : ''}
                        `}>
                          {option}
                        </div>
                        
                        {hasSubmitted && (
                          <div className="mt-1 text-xs">
                            {isStudentAnswer && (
                              <span className="text-blue-400">Your answer</span>
                            )}
                            {showCorrectAnswer && (
                              <span className="text-green-400">Correct answer</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {hasSubmitted && (
                <div className={`
                  p-4 rounded-lg border-2 text-center
                  ${selectedOption === activeQuiz.correctAnswer 
                    ? 'bg-green-500/20 border-green-500 text-green-400' 
                    : 'bg-red-500/20 border-red-500 text-red-400'
                  }
                `}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {selectedOption === activeQuiz.correctAnswer ? (
                      <>
                        <CheckCircle2 className="w-6 h-6" />
                        <span className="text-xl font-bold">Correct! 🎉</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-6 h-6" />
                        <span className="text-xl font-bold">Incorrect 😔</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm">
                    {selectedOption === activeQuiz.correctAnswer 
                      ? 'Excellent! You got it right!' 
                      : `Better luck next time! The correct answer was Option ${activeQuiz.correctAnswer + 1}`
                    }
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                {!hasSubmitted ? (
                  <>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleQuizDialogClose}
                      className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                    >
                      Close
                    </Button>
                    <Button 
                      onClick={handleSubmitQuizResponse}
                      disabled={selectedOption === null || dismissedQuizzes.has(activeQuiz.id)}
                      className={`
                        flex-1 transition-all duration-200
                        ${selectedOption === null || dismissedQuizzes.has(activeQuiz.id)
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                          : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-500/25'
                        }
                      `}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {dismissedQuizzes.has(activeQuiz.id) ? 'Already Submitted' : 'Submit Answer'}
                    </Button>
                  </>
                ) : (
                  <div className="flex-1 space-y-3">
                    <div className="text-center text-sm text-gray-400">
                      {selectedOption === activeQuiz.correctAnswer 
                        ? 'Your answer has been recorded successfully!' 
                        : 'You can review the correct answer above.'
                      }
                    </div>
                    <Button 
                      onClick={handleQuizDialogClose}
                      className="w-full bg-gray-600 hover:bg-gray-700"
                    >
                      Close Review
                    </Button>
                  </div>
                )}
              </div>
              
              {hasSubmitted && (
                <div className="pt-2 border-t border-gray-700">
                  <div className="text-xs text-gray-400 text-center">
                    You have already submitted your answer for this quiz.
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quiz Results</DialogTitle>
            <DialogDescription className="text-gray-400">
              Results for: {activeQuiz?.question}
            </DialogDescription>
          </DialogHeader>
            
          {activeQuiz && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-400">{totalResponses}</p>
                  <p className="text-sm text-gray-400">Total Responses</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-400">{correctCount}</p>
                  <p className="text-sm text-gray-400">Correct Answers</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-400">{accuracy}%</p>
                  <p className="text-sm text-gray-400">Accuracy</p>
                </div>
              </div>
            
              <div>
                <h4 className="font-medium mb-3">Response Breakdown</h4>
                <div className="space-y-2">
                  {activeQuiz.options.map((option, index) => {
                    const optionCount = quizResponses.filter(r => r.selectedOption === index).length;
                    const percentage = totalResponses > 0 ? Math.round((optionCount / totalResponses) * 100) : 0;
                    const isCorrect = index === activeQuiz.correctAnswer;
                    
                    return (
                      <div key={index} className="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
                        <div className="flex items-center gap-2 w-40">
                          <span className={`w-3 h-3 rounded-full ${isCorrect ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                          <span className="text-sm font-medium">Option {index + 1}</span>
                          {isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-300 truncate flex-1 mr-4">{option}</span>
                            <span className="text-gray-400 whitespace-nowrap">
                              {optionCount} ({percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-600 rounded-full h-3">
                            <div 
                              className={`h-3 rounded-full transition-all duration-500 ${
                                isCorrect ? 'bg-green-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                
              <div>
                <h4 className="font-medium mb-3">Student Responses</h4>
                {quizResponses.length > 0 ? (
                  <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-600 rounded-lg p-2">
                    {quizResponses.map((response) => (
                      <div 
                        key={response.id} 
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                          response.isCorrect ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={response.isCorrect ? 'bg-green-600' : 'bg-red-600'}>
                            {response.studentName?.[0]?.toUpperCase() || 'S'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{response.studentName}</p>
                            {response.isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-gray-400">
                            Selected: {activeQuiz.options[response.selectedOption]}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-700/50 rounded-lg border border-gray-600">
                    <p className="text-gray-400">No responses yet</p>
                  </div>
                )}
              </div>
      
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setShowResultsDialog(false)}
                  className="flex-1"
                >
                  Close
                </Button>
                <Button 
                  onClick={handleCloseQuiz}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Close Quiz
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}