import { useState, useEffect, useRef } from 'react';
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
  deleteDoc
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
  Send,
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
  private lastMuteState: { video?: boolean, audio?: boolean } = {};
  private muteDebounceTimer: NodeJS.Timeout | null = null;
  private eventListeners: { type: string; listener: EventListener }[] = [];

  async startScreenShare(): Promise<MediaStream> {
    try {
      console.log('Starting screen share...');
      
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'window',
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 }
        } as any,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          channelCount: 2
        }
      });

      console.log('Screen share stream obtained:', this.localStream.id);
      this.isSharing = true;

      this.lastMuteState = {
        video: !this.localStream.getVideoTracks()[0]?.enabled,
        audio: !this.localStream.getAudioTracks()[0]?.enabled
      };

      // Handle when user stops screen share via browser UI
      const handleTrackEnded = () => {
        console.log('Screen share ended by browser UI');
        this.stopScreenShare();
      };

      this.localStream.getVideoTracks()[0].addEventListener('ended', handleTrackEnded);
      this.eventListeners.push({ type: 'ended', listener: handleTrackEnded });

      // Add debounced event listeners for track events
      this.localStream.getTracks().forEach(track => {
        const handleMute = () => {
          if (this.muteDebounceTimer) {
            clearTimeout(this.muteDebounceTimer);
          }
          
          this.muteDebounceTimer = setTimeout(() => {
            const currentMuted = !track.enabled;
            const previousMuted = this.lastMuteState[track.kind as keyof typeof this.lastMuteState];
            
            if (currentMuted !== previousMuted) {
              console.log('Track muted:', track.kind);
              this.lastMuteState[track.kind as keyof typeof this.lastMuteState] = currentMuted;
              
              window.dispatchEvent(new CustomEvent('screenshare-mute-change', {
                detail: { kind: track.kind, muted: currentMuted }
              }));
            }
          }, 100);
        };

        const handleUnmute = () => {
          if (this.muteDebounceTimer) {
            clearTimeout(this.muteDebounceTimer);
          }
          
          this.muteDebounceTimer = setTimeout(() => {
            const currentMuted = !track.enabled;
            const previousMuted = this.lastMuteState[track.kind as keyof typeof this.lastMuteState];
            
            if (currentMuted !== previousMuted) {
              console.log('Track unmuted:', track.kind);
              this.lastMuteState[track.kind as keyof typeof this.lastMuteState] = currentMuted;
              
              window.dispatchEvent(new CustomEvent('screenshare-mute-change', {
                detail: { kind: track.kind, muted: currentMuted }
              }));
            }
          }, 100);
        };

        const handleEnded = () => {
          console.log('Track ended:', track.kind);
          this.stopScreenShare();
        };

        track.addEventListener('mute', handleMute);
        track.addEventListener('unmute', handleUnmute);
        track.addEventListener('ended', handleEnded);

        this.eventListeners.push(
          { type: 'mute', listener: handleMute },
          { type: 'unmute', listener: handleUnmute },
          { type: 'ended', listener: handleEnded }
        );
      });

      return this.localStream;
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }

  stopScreenShare() {
    console.log('Stopping screen share...');
    
    // Remove all event listeners first to prevent recursion
    this.eventListeners.forEach(({ type, listener }) => {
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.removeEventListener(type, listener);
        });
      }
    });
    this.eventListeners = [];
    
    if (this.muteDebounceTimer) {
      clearTimeout(this.muteDebounceTimer);
      this.muteDebounceTimer = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    
    this.isSharing = false;
    this.lastMuteState = {};
    
    // Dispatch event only if we're actually stopping an active share
    if (this.isSharing) {
      window.dispatchEvent(new CustomEvent('screenshare-ended'));
    }
  }

  isScreenSharing(): boolean {
    return this.isSharing;
  }

  getStream(): MediaStream | null {
    return this.localStream;
  }

  getStreamInfo() {
    if (!this.localStream) return null;
    
    const videoTrack = this.localStream.getVideoTracks()[0];
    const audioTrack = this.localStream.getAudioTracks()[0];
    
    const streamInfo: any = {
      hasVideo: !!videoTrack,
      hasAudio: !!audioTrack,
      videoReadyState: videoTrack?.readyState,
      audioReadyState: audioTrack?.readyState
    };

    if (videoTrack) {
      streamInfo.videoSettings = {
        width: videoTrack.getSettings().width,
        height: videoTrack.getSettings().height,
        frameRate: videoTrack.getSettings().frameRate,
        deviceId: videoTrack.getSettings().deviceId
      };
    }

    if (audioTrack) {
      streamInfo.audioSettings = {
        sampleRate: audioTrack.getSettings().sampleRate,
        channelCount: audioTrack.getSettings().channelCount,
        deviceId: audioTrack.getSettings().deviceId
      };
    }
    
    return streamInfo;
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
  const [streamInfo, setStreamInfo] = useState<any>(null);
  
  // WebRTC States
  const [webRTCManager] = useState(new WebRTCManager());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [activeConnections, setActiveConnections] = useState<Set<string>>(new Set());

  // Quiz states
  const [showQuizDialog, setShowQuizDialog] = useState(false);
  const [showQuizResponseDialog, setShowQuizResponseDialog] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [activeQuiz, _setActiveQuiz] = useState<Quiz | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [quizResponses, _setQuizResponses] = useState<QuizResponse[]>([]);
  const [dismissedQuizzes, setDismissedQuizzes] = useState<Set<string>>(new Set());
  
  // Student states
  const [students, _setStudents] = useState<StudentAttendance[]>([]);
  const [activeScreenShare, setActiveScreenShare] = useState<any>(null);
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

  // Find class by roomId instead of document ID
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

          if (classDataObj.teacherId === currentUser?.uid && classDataObj.status === 'scheduled') {
            console.log('Starting class as teacher');
            await updateDoc(doc(db, 'classes', classDoc.id), { 
              status: 'live',
              startedAt: Timestamp.fromDate(new Date())
            });
          }

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

  // WebRTC Signaling Listener
  useEffect(() => {
    if (!classData?.id || !currentUser) return;

    console.log('Setting up WebRTC signaling listener for class:', classData.id);

    const signalingQuery = query(
      collection(db, 'webrtcSignals'),
      where('classId', '==', classData.id),
      where('targetUserId', '==', currentUser.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribeSignaling = onSnapshot(signalingQuery, 
      async (snapshot) => {
        for (const docChange of snapshot.docChanges()) {
          if (docChange.type === 'added') {
            const signal = docChange.doc.data();
            console.log('Received WebRTC signal:', signal.type, 'from:', signal.fromUserId);
            await handleSignalingMessage(signal);
            
            // Clean up the signal after processing
            try {
              await deleteDoc(doc(db, 'webrtcSignals', docChange.doc.id));
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

    return () => unsubscribeSignaling();
  }, [classData?.id, currentUser, isTeacher]);

// Handle WebRTC signaling messages
// In ClassRoom.tsx - Update the handleSignalingMessage function
const handleSignalingMessage = async (signal: any) => {
  try {
    // Skip if this is our own signal
    if (signal.fromUserId === currentUser?.uid) {
      return;
    }

    // Reconstruct RTC objects from plain objects
    let processedSignal = { ...signal };
    
    if (signal.offer) {
      processedSignal.offer = new RTCSessionDescription({
        type: signal.offer.type,
        sdp: signal.offer.sdp
      });
    }
    
    if (signal.answer) {
      processedSignal.answer = new RTCSessionDescription({
        type: signal.answer.type,
        sdp: signal.answer.sdp
      });
    }
    
    if (signal.candidate) {
      processedSignal.candidate = signal.candidate; // Already a plain object
    }

    console.log('Processing WebRTC signal:', processedSignal.type, 'from:', processedSignal.fromUserId, 'state:', webRTCManager.getSignalingState(processedSignal.fromUserId));

    switch (processedSignal.type) {
      case 'offer':
        if (!isTeacher) {
          console.log('Handling offer from teacher:', processedSignal.fromUserId);
          
          // Check if we already have a connection
          if (webRTCManager.hasConnection(processedSignal.fromUserId)) {
            console.log('Already have connection with teacher, skipping offer');
            return;
          }
          
          const answer = await webRTCManager.handleOffer(processedSignal.fromUserId, processedSignal.offer);
          await sendSignalingMessage({
            type: 'answer',
            fromUserId: currentUser?.uid,
            targetUserId: processedSignal.fromUserId,
            answer: answer
          });
        }
        break;

      case 'answer':
        if (isTeacher) {
          console.log('Handling answer from student:', processedSignal.fromUserId);
          
          // Check connection state before handling answer
          const signalingState = webRTCManager.getSignalingState(processedSignal.fromUserId);
          if (signalingState !== 'have-local-offer') {
            console.warn(`Cannot handle answer in state: ${signalingState}, expected: have-local-offer. This is likely a duplicate.`);
            return; // Silently ignore duplicate answers
          }
          
          await webRTCManager.handleAnswer(processedSignal.fromUserId, processedSignal.answer);
        }
        break;

      case 'ice-candidate':
        console.log('Handling ICE candidate from:', processedSignal.fromUserId);
        await webRTCManager.addIceCandidate(processedSignal.fromUserId, processedSignal.candidate);
        break;

      case 'join-request':
        if (isTeacher) {
          console.log('Handling join request from student:', processedSignal.fromUserId);
          
          // Check if we already have a connection with this student
          if (webRTCManager.hasConnection(processedSignal.fromUserId)) {
            console.log('Already connected to student:', processedSignal.fromUserId);
            return;
          }
          
          await initiateConnectionWithStudent(processedSignal.fromUserId);
        }
        break;
    }
  } catch (error) {
    console.error('Error handling signaling message:', error);
    // Don't show error toast for duplicate messages
    if (!(error as Error).message?.includes('duplicate') && !(error as Error).name?.includes('InvalidState')) {
      toast.error('Failed to process connection message');
    }
  }
};

  // Send signaling message
  const sendSignalingMessage = async (message: any) => {
    if (!classData || !currentUser) return;

    try {
      await addDoc(collection(db, 'webrtcSignals'), {
        ...message,
        classId: classData.id,
        createdAt: Timestamp.fromDate(new Date())
      });
      console.log('Sent WebRTC signal:', message.type);
    } catch (error) {
      console.error('Error sending signaling message:', error);
    }
  };

// In ClassRoom.tsx - Update initiateConnectionWithStudent
const initiateConnectionWithStudent = async (studentId: string) => {
  if (!isTeacher || !currentUser) return;

  // Check if we already have a connection and it's in a valid state
  if (webRTCManager.hasConnection(studentId)) {
    const signalingState = webRTCManager.getSignalingState(studentId);
    console.log('Already have connection with student:', studentId, 'state:', signalingState);
    
    // If connection is stable or connected, don't create a new one
    if (signalingState === 'stable' || signalingState === 'connected') {
      console.log('Connection already established with student:', studentId);
      return;
    }
    
    // If connection is in a bad state, close it first
    if (signalingState === 'closed' || signalingState === 'failed') {
      console.log('Closing bad connection with student:', studentId);
      webRTCManager.closeConnection(studentId);
    }
  }

  try {
    console.log('Initiating connection with student:', studentId);
    const offer = await webRTCManager.createOffer(studentId);
    await sendSignalingMessage({
      type: 'offer',
      fromUserId: currentUser.uid,
      targetUserId: studentId,
      offer: offer
    });
  } catch (error) {
    console.error('Error initiating connection:', error);
    toast.error('Failed to connect with student');
    
    // Clean up failed connection
    webRTCManager.closeConnection(studentId);
  }
};

  // Student join request
  const sendJoinRequest = async () => {
    if (isTeacher || !classData || !currentUser) return;

    console.log('Sending join request to teacher');
    await sendSignalingMessage({
      type: 'join-request',
      fromUserId: currentUser.uid,
      targetUserId: classData.teacherId
    });
  };

  // WebRTC Event Listeners
  useEffect(() => {
    const handleRemoteStreamAdded = (event: CustomEvent) => {
      const { studentId, stream } = event.detail;
      console.log('Remote stream added event:', studentId);
      setRemoteStreams(prev => new Map(prev).set(studentId, stream));
      
      // Update video element when it's available
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

// In ClassRoom.tsx - Update the WebRTC Signaling Listener
useEffect(() => {
  if (!classData?.id || !currentUser) return;

  console.log('Setting up WebRTC signaling listener for class:', classData.id);

  const processedSignalIds = new Set<string>();
  const recentSignals = new Map(); // Track recent signals by type and fromUserId

  const signalingQuery = query(
    collection(db, 'webrtcSignals'),
    where('classId', '==', classData.id),
    where('targetUserId', '==', currentUser.uid),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  const unsubscribeSignaling = onSnapshot(signalingQuery, 
    async (snapshot) => {
      for (const docChange of snapshot.docChanges()) {
        if (docChange.type === 'added') {
          const signal = docChange.doc.data();
          const signalId = docChange.doc.id;
          
          // Prevent processing the same signal multiple times
          if (processedSignalIds.has(signalId)) {
            continue;
          }
          processedSignalIds.add(signalId);
          
          // Create a unique key for this type of signal to prevent duplicates
          const signalKey = `${signal.type}-${signal.fromUserId}`;
          const now = Date.now();
          const lastSignalTime = recentSignals.get(signalKey) || 0;
          
          // Prevent processing the same signal type from the same user within 2 seconds
          if (now - lastSignalTime < 2000) {
            console.log('Skipping duplicate signal:', signalKey);
            continue;
          }
          recentSignals.set(signalKey, now);
          
          console.log('Received WebRTC signal:', signal.type, 'from:', signal.fromUserId);
          await handleSignalingMessage(signal);
          
          // Clean up the signal after processing
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
    // Clean up WebRTC connections when component unmounts
    webRTCManager.closeAllConnections();
    webRTCManager.stopLocalStream();
  };
}, [classData?.id, currentUser, isTeacher]);

// Monitor connection states
useEffect(() => {
  const intervalId = setInterval(() => {
    if (isTeacher) {
      const activeConnections = webRTCManager.getActiveConnections();
      console.log('Active connections:', activeConnections.length);
      
      activeConnections.forEach(studentId => {
        const state = webRTCManager.getConnectionState(studentId);
        const signalingState = webRTCManager.getSignalingState(studentId);
        console.log(`Student ${studentId}: connection=${state}, signaling=${signalingState}`);
      });
    }
  }, 10000); // Log every 10 seconds

  return () => clearInterval(intervalId);
}, [isTeacher]);

// Student auto-join when class is loaded
useEffect(() => {
  if (!isTeacher && classData && currentUser) {
    console.log('Student preparing to join class');
    
    const initializeStudentMedia = async () => {
      try {
        // Initialize media with at least one media type enabled
        // For students, we'll enable audio by default but not video
        await initializeMedia(true, false);
        console.log('Student media initialized');
        
        // Wait a bit for teacher to be ready, then send join request
        setTimeout(() => {
          sendJoinRequest();
        }, 3000);
      } catch (error) {
        console.error('Failed to initialize student media:', error);
        // If media initialization fails, still try to send join request
        // but only enable audio (no video) as a fallback
        try {
          await initializeMedia(true, false);
        } catch (fallbackError) {
          console.error('Fallback media initialization also failed:', fallbackError);
          // If even audio fails, try without any media (just for signaling)
          // This allows the student to join and see teacher's video even if their own media fails
          console.log('Proceeding without local media - student can still view teacher');
        }
        
        // Send join request even if media fails
        setTimeout(() => {
          sendJoinRequest();
        }, 3000);
      }
    };

    initializeStudentMedia();
  }
}, [isTeacher, classData, currentUser]);

// Initialize media streams
const initializeMedia = async (audio: boolean = true, video: boolean = true) => {
  try {
    setMediaError(null);
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMediaError('Media devices not supported in this browser');
      return false;
    }

    // Validate that at least one media type is requested
    if (!audio && !video) {
      console.warn('Both audio and video are disabled, enabling audio by default');
      audio = true; // Enable audio as fallback
    }

    console.log('Requesting media permissions for audio:', audio, 'video:', video);
    const stream = await webRTCManager.initializeLocalStream(audio, video);
    setLocalStream(stream);
    setIsWebRTCInitialized(true);
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    
    if (isTeacher) {
      setVideoEnabled(video);
      setAudioEnabled(audio);
    } else {
      // For students, set the enabled states based on what was actually requested
      setVideoEnabled(video);
      setAudioEnabled(audio);
    }
    
    console.log('Media stream initialized successfully');
    return true;
    
  } catch (error: any) {
    console.error('Error accessing media devices:', error);
    
    if (error.name === 'NotAllowedError') {
      setMediaError('Camera/microphone access denied. Please allow permissions in your browser.');
      toast.error('Camera/microphone access denied. Please allow permissions to use these features.');
    } else if (error.name === 'NotFoundError') {
      setMediaError('No camera/microphone found. Please connect a device to use these features.');
      toast.error('No camera/microphone found. Please connect a device to use these features.');
    } else if (error.name === 'NotReadableError') {
      setMediaError('Camera/microphone is in use by another application. Please close other applications and try again.');
      toast.error('Camera/microphone is in use by another application. Please close other applications and try again.');
    } else if (error.name === 'OverconstrainedError') {
      setMediaError('Cannot satisfy the requested media constraints. Trying with different settings...');
      console.warn('Media constraints cannot be satisfied, trying fallback...');
      // Try with more permissive constraints
      return await initializeMediaWithFallback(audio, video);
    } else {
      setMediaError('Failed to access camera/microphone. Please check your device permissions.');
      toast.error('Failed to access camera/microphone. Please check your device permissions.');
    }
    return false;
  }
};

// Fallback media initialization with more permissive constraints
const initializeMediaWithFallback = async (audio: boolean, video: boolean): Promise<boolean> => {
  try {
    console.log('Trying fallback media initialization...');
    
    // If both failed, try just audio
    if (!audio && !video) {
      audio = true;
    }
    
    // If video failed but was requested, try with lower constraints
    if (video) {
      try {
        const stream = await webRTCManager.initializeLocalStream(audio, true);
        setLocalStream(stream);
        setIsWebRTCInitialized(true);
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        
        setVideoEnabled(true);
        setAudioEnabled(audio);
        console.log('Fallback media initialization successful');
        return true;
      } catch (videoError) {
        console.warn('Video initialization failed, trying audio only...');
        // If video still fails, try audio only
        return await initializeMediaWithFallback(audio, false);
      }
    }
    
    // Final attempt with just audio
    const stream = await webRTCManager.initializeLocalStream(audio, false);
    setLocalStream(stream);
    setIsWebRTCInitialized(true);
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    
    setVideoEnabled(false);
    setAudioEnabled(audio);
    console.log('Audio-only media initialization successful');
    return true;
    
  } catch (fallbackError) {
    console.error('All media initialization attempts failed:', fallbackError);
    setMediaError('Unable to access any media devices. You can still join the class to view the teacher.');
    return false;
  }
};

  const toggleVideo = async () => {
    const newVideoState = !videoEnabled;
    
    if (!webRTCManager.isStreamInitialized()) {
      await initializeMedia(audioEnabled, true);
    } else {
      webRTCManager.updateLocalStreamTracks(audioEnabled, newVideoState);
    }
    
    setVideoEnabled(newVideoState);

    if (newVideoState) {
      toast.success('Camera turned on');
    } else {
      toast.info('Camera turned off');
    }
  };

  const toggleAudio = async () => {
    const newAudioState = !audioEnabled;
    
    if (!webRTCManager.isStreamInitialized()) {
      await initializeMedia(true, videoEnabled);
    } else {
      webRTCManager.updateLocalStreamTracks(newAudioState, videoEnabled);
    }
    
    setAudioEnabled(newAudioState);

    if (newAudioState) {
      toast.success('Microphone turned on');
    } else {
      toast.info('Microphone turned off');
    }
  };

const handleStartScreenShare = async () => {
  try {
    console.log('Starting screen share...');
    
    const stream = await screenShareInstance.current.startScreenShare();
    setScreenStream(stream);
    setIsScreenSharing(true);

    const info = screenShareInstance.current.getStreamInfo();
    setStreamInfo(info);
    console.log('Screen share stream info:', info);

    if (screenShareRef.current) {
      screenShareRef.current.srcObject = stream;
      console.log('Screen share stream attached to video element');
    }

    // Record screen share in database for students
    if (isTeacher && classData) {
      try {
        // First, deactivate any existing screen shares
        const existingSharesQuery = query(
          collection(db, 'screenShares'),
          where('classId', '==', classData.id),
          where('isActive', '==', true)
        );
        
        const existingShares = await getDocs(existingSharesQuery);
        const updatePromises = existingShares.docs.map(doc => 
          updateDoc(doc.ref, {
            isActive: false,
            endedAt: Timestamp.fromDate(new Date())
          })
        );
        
        await Promise.all(updatePromises);

        // Create new screen share record
        const screenShareData: any = {
          classId: classData.id,
          teacherId: currentUser?.uid,
          teacherName: currentUser?.displayName || currentUser?.email,
          isActive: true,
          startedAt: Timestamp.fromDate(new Date()),
          streamId: `screenshare-${Date.now()}`
        };

        if (info) {
          const cleanStreamInfo = JSON.parse(JSON.stringify(info));
          screenShareData.streamInfo = cleanStreamInfo;
        }

        await addDoc(collection(db, 'screenShares'), screenShareData);
        
        console.log('Screen share recorded in database');
      } catch (dbError: any) {
        console.error('Error recording screen share in database:', dbError);
        toast.warning('Screen sharing started, but database update failed. Students may not see the share indicator.');
      }
    }

    toast.success('Screen sharing started - Students can now see your screen');
    
    // Add event listener for mute changes
    const handleMuteChange = (event: CustomEvent) => {
      const { kind, muted } = event.detail;
      if (kind === 'video') {
        if (muted) {
          toast.warning('Screen share video paused');
        } else {
          toast.info('Screen share video resumed');
        }
      }
    };

    const handleScreenShareEnded = () => {
      console.log('Screen share ended event received');
      // Remove event listeners first
      window.removeEventListener('screenshare-mute-change', handleMuteChange as EventListener);
      window.removeEventListener('screenshare-ended', handleScreenShareEnded);
      // Then stop screen share
      handleStopScreenShare();
    };

    window.addEventListener('screenshare-mute-change', handleMuteChange as EventListener);
    window.addEventListener('screenshare-ended', handleScreenShareEnded);

    // Return cleanup function
    return () => {
      window.removeEventListener('screenshare-mute-change', handleMuteChange as EventListener);
      window.removeEventListener('screenshare-ended', handleScreenShareEnded);
    };
    
  } catch (error) {
    console.error('Error starting screen share:', error);
    if ((error as Error).name === 'NotAllowedError') {
      toast.error('Screen sharing permission denied. Please allow screen sharing in your browser.');
    } else if ((error as Error).name === 'NotFoundError') {
      toast.error('No screen sharing sources found. Please check your system settings.');
    } else if ((error as Error).name === 'NotSupportedError') {
      toast.error('Screen sharing is not supported in this browser.');
    } else {
      toast.error('Failed to start screen sharing. Please try again.');
    }
  }
};

  const handleStopScreenShare = async () => {
    console.log('Stopping screen share...');
    screenShareInstance.current.stopScreenShare();
    setScreenStream(null);
    setIsScreenSharing(false);
    setStreamInfo(null);

    // Update screen share record in database
    if (isTeacher && classData && activeScreenShare) {
      try {
        await updateDoc(doc(db, 'screenShares', activeScreenShare.id), {
          isActive: false,
          endedAt: Timestamp.fromDate(new Date())
        });
        console.log('Screen share stopped in database');
        
        setActiveScreenShare(null);
        setIsScreenShareActive(false);
      } catch (error) {
        console.error('Error updating screen share record:', error);
        setActiveScreenShare(null);
        setIsScreenShareActive(false);
      }
    } else if (isTeacher && classData) {
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
        console.log('Cleaned up all active screen shares');
      } catch (error) {
        console.error('Error cleaning up screen shares:', error);
      }
      
      setActiveScreenShare(null);
      setIsScreenShareActive(false);
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
      toast.success('Quiz created successfully! Students can now see it.');
      setShowQuizDialog(false);
      setNewQuiz({ question: '', option1: '', option2: '', option3: '', option4: '', correctAnswer: 0 });
    } catch (error: any) {
      toast.error(error.message || 'Failed to create quiz');
    }
  };

  const handleSubmitQuizResponse = async () => {
    if (selectedOption === null || !activeQuiz || !classData) return;

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
        quizTitle: activeQuiz.question.substring(0, 50) + (activeQuiz.question.length > 50 ? '...' : ''),
        score: selectedOption === activeQuiz.correctAnswer ? 1 : 0,
        totalQuestions: 1
      };

      await addDoc(collection(db, 'quizResponses'), responseData);
      toast.success('Answer submitted!');
      setHasSubmitted(true);
      setTimeout(() => {
        setShowQuizResponseDialog(false);
        setDismissedQuizzes(prev => new Set(prev).add(activeQuiz.id));
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit answer');
    }
  };

  const handleQuizDialogClose = () => {
    if (activeQuiz && !isTeacher) {
      setDismissedQuizzes(prev => new Set(prev).add(activeQuiz.id));
    }
    setShowQuizResponseDialog(false);
    setSelectedOption(null);
    setHasSubmitted(false);
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
      setDismissedQuizzes(new Set());
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
      webRTCManager.stopLocalStream();
      webRTCManager.closeAllConnections();
      
      if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
      }
      screenShareInstance.current.stopScreenShare();
      
      // End any active screen shares
      if (activeScreenShare) {
        await updateDoc(doc(db, 'screenShares', activeScreenShare.id), {
          isActive: false,
          endedAt: Timestamp.fromDate(new Date())
        });
      }
      
      // End any active quizzes
      if (activeQuiz) {
        await updateDoc(doc(db, 'quizzes', activeQuiz.id), { isActive: false });
      }
      
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
  // Monitor and display connection status
useEffect(() => {
  if (isTeacher) {
    const interval = setInterval(() => {
      const activeConnectionsList = webRTCManager.getActiveConnections();
      console.log(`Teacher: ${activeConnectionsList.length} active connections`);
      
      activeConnectionsList.forEach(studentId => {
        const connectionState = webRTCManager.getConnectionState(studentId);
        const signalingState = webRTCManager.getSignalingState(studentId);
        console.log(`Student ${studentId}: ${connectionState} (signaling: ${signalingState})`);
      });
    }, 10000);

    return () => clearInterval(interval);
  }
}, [isTeacher]);

  // Initialize media for teachers on component mount
  useEffect(() => {
    if (isTeacher) {
      initializeMedia(true, true);
    }
  }, [isTeacher]);

// Cleanup media streams on unmount
useEffect(() => {
  return () => {
    console.log('Cleaning up classroom resources');
    webRTCManager.stopLocalStream();
    webRTCManager.closeAllConnections();
    
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    screenShareInstance.current.stopScreenShare();
  };
}, [screenStream]);

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
                {isTeacher && ` • ${activeConnections.size}/${students.length} CONNECTED`}
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

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-blue-900 text-blue-100 p-2 text-xs">
          <strong>Debug:</strong> Class: {classData.title} | Status: {classData.status} | 
          Teacher: {isTeacher ? 'Yes' : 'No'} | Screen Share Active: {isScreenShareActive ? 'Yes' : 'No'} |
          Students: {students.length} | Active Quiz: {activeQuiz ? 'Yes' : 'No'} |
          WebRTC Connected: {activeConnections.size} | Remote Streams: {remoteStreams.size}
        </div>
      )}

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
              {streamInfo && (
                <div className="mt-2 text-xs text-gray-400">
                  Stream: {streamInfo.hasVideo ? 'Video ✓' : 'Video ✗'} | {streamInfo.hasAudio ? 'Audio ✓' : 'Audio ✗'}
                </div>
              )}
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
                    
                    <div className="mt-6 p-4 bg-gray-800 rounded-lg max-w-md mx-auto">
                      <h4 className="font-semibold mb-2">You're seeing:</h4>
                      <ul className="text-sm text-gray-300 text-left space-y-1">
                        <li>• Teacher's live screen</li>
                        <li>• Presentations and documents</li>
                        <li>• Real-time demonstrations</li>
                        <li>• Code and applications</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white p-2 rounded text-sm">
                  Watching {classData.teacherName}'s screen • Live
                </div>
                <div className="absolute top-4 right-4 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold animate-pulse">
                  LIVE
                </div>
              </div>
              <div className="mt-2 text-xs text-green-400 flex items-center gap-2">
                <ScreenShare className="w-3 h-3" />
                Screen sharing active • You're seeing the teacher's screen in real-time
              </div>
              
              <div className="mt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => toast.info('Screen sharing controls are managed by the teacher')}
                  className="text-xs"
                >
                  <Eye className="w-3 h-3 mr-1" />
                  View Full Screen
                </Button>
                {activeQuiz && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={dismissedQuizzes.has(activeQuiz.id) ? handleReopenQuiz : () => setShowQuizResponseDialog(true)}
                    className="text-xs bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                  >
                    <Award className="w-3 h-3 mr-1" />
                    Answer Quiz
                  </Button>
                )}
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
                              <div className="absolute top-2 right-2">
                                <Badge 
                                  variant={isConnected ? "default" : "secondary"} 
                                  className={`text-xs ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                                >
                                  {isConnected ? 'Live' : 'Offline'}
                                </Badge>
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
                  Start screen sharing to show your presentation, documents, or anything on your screen to all students.
                  They will see your actual screen in real-time.
                </p>
                <Button 
                  onClick={handleStartScreenShare} 
                  size="lg" 
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <ScreenShare className="w-5 h-5 mr-2" />
                  Share Screen
                </Button>
                <p className="text-sm text-gray-500 mt-4">
                  Students will see your actual screen when you start sharing
                </p>
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
                            <div className="absolute top-2 right-2">
                              <Badge variant="default" className="bg-green-500 text-white text-xs">
                                Live
                              </Badge>
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
                  {!webRTCManager.isStreamInitialized() && (
                    <Button 
                      onClick={() => initializeMedia(true, true)} 
                      className="mt-4"
                      variant="outline"
                    >
                      <Video className="w-4 h-4 mr-2" />
                      Enable My Camera
                    </Button>
                  )}
                </div>
              )}

              {/* Student's Own Video (if enabled) */}
              {webRTCManager.isStreamInitialized() && (
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
                    The teacher will start sharing their screen shortly. You'll see the presentation here in real-time.
                  </p>
                  {classData.teacherName && (
                    <p className="text-blue-400 mt-4">
                      Teacher: {classData.teacherName}
                    </p>
                  )}
                  <div className="mt-6 p-4 bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-300">
                      <strong>Students online:</strong> {students.length}
                    </p>
                    {activeQuiz && (
                      <p className="text-sm text-yellow-300 mt-2">
                        <strong>Active Quiz:</strong> There's a quiz available to answer
                      </p>
                    )}
                    {remoteStreams.size > 0 && (
                      <p className="text-sm text-green-300 mt-2">
                        <strong>Video:</strong> Connected to teacher's camera
                      </p>
                    )}
                  </div>
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
                              {!isConnected && student.studentId !== classData?.teacherId && ' • Offline'}
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
                        disabled={!webRTCManager.isStreamInitialized()}
                      >
                        {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant={audioEnabled ? "default" : "secondary"}
                        size="sm"
                        onClick={toggleAudio}
                        className="flex-1"
                        disabled={!webRTCManager.isStreamInitialized()}
                      >
                        {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                      </Button>
                    </div>
                    
                    {/* Show media status */}
                    {!webRTCManager.isStreamInitialized() && (
                      <div className="text-center">
                        <Button 
                          onClick={() => initializeMedia(true, false)} 
                          size="sm" 
                          variant="outline"
                          className="w-full mb-2"
                        >
                          <Mic className="w-4 h-4 mr-2" />
                          Enable Microphone
                        </Button>
                        <Button 
                          onClick={() => initializeMedia(false, true)} 
                          size="sm" 
                          variant="outline"
                          className="w-full"
                        >
                          <Video className="w-4 h-4 mr-2" />
                          Enable Camera
                        </Button>
                        <p className="text-xs text-gray-400 mt-2">
                          Enable at least one to participate with audio/video
                        </p>
                      </div>
                    )}
                    
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
                      Quiz Available
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!dismissedQuizzes.has(activeQuiz.id) ? (
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
                      <Button 
                        onClick={handleReopenQuiz}
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start"
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        View Quiz Again
                      </Button>
                    )}
                    <div className="text-xs text-gray-400 mt-2">
                      {totalResponses} students have responded
                    </div>
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
                  {activeQuiz && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">Active Quiz:</span>
                        <span className="text-yellow-400">{totalResponses} responses</span>
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
              <div className="p-4 border-t border-gray-700">
                <div className="flex gap-2">
                  <Input 
                    placeholder="Type a message..." 
                    className="bg-gray-700 border-gray-600"
                    disabled
                  />
                  <Button disabled>
                    <Send className="w-4 h-4" />
                  </Button>
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
                        {!isTeacher && (
                          <Button 
                            onClick={dismissedQuizzes.has(activeQuiz.id) ? handleReopenQuiz : () => setShowQuizResponseDialog(true)}
                            size="sm" 
                            className="w-full mt-2 bg-yellow-500 hover:bg-yellow-600"
                          >
                            {dismissedQuizzes.has(activeQuiz.id) ? 'View Quiz Again' : 'Answer Quiz'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <Award className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">No active activities</p>
                    </div>
                  )}

                  {isTeacher && quizResponses.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Recent Responses</h4>
                      <div className="space-y-2">
                        {quizResponses.slice(-3).map((response) => (
                          <div key={response.id} className="flex items-center gap-2 text-xs p-2 bg-gray-600 rounded">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-xs bg-purple-600">
                                {response.studentName?.[0]?.toUpperCase() || 'S'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="truncate">{response.studentName}</p>
                            </div>
                            {response.isCorrect ? (
                              <CheckCircle2 className="w-4 h-4 text-green-400" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isTeacher && activeConnections.size > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-gray-400 mb-2">Connected Students</h4>
                      <div className="space-y-2">
                        {Array.from(activeConnections).slice(0, 3).map(studentId => {
                          const student = students.find(s => s.studentId === studentId);
                          return (
                            <div key={studentId} className="flex items-center gap-2 text-xs p-2 bg-gray-600 rounded">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs bg-green-600">
                                  {student?.studentName?.[0]?.toUpperCase() || 'S'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="truncate">{student?.studentName || 'Student'}</p>
                              </div>
                              <Wifi className="w-3 h-3 text-green-400" />
                            </div>
                          );
                        })}
                        {activeConnections.size > 3 && (
                          <div className="text-center text-xs text-gray-400">
                            +{activeConnections.size - 3} more connected
                          </div>
                        )}
                      </div>
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
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Award className="w-6 h-6 text-yellow-400" />
              Create Quiz
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Create a multiple-choice quiz for your students
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 -mr-2 custom-scrollbar">
            <form onSubmit={handleCreateQuiz} className="space-y-6 pb-4">
              <div className="space-y-3">
                <Label htmlFor="question" className="text-sm font-medium text-gray-300 flex items-center gap-2">
                  <span>Question</span>
                  <span className="text-red-400">*</span>
                </Label>
                <Textarea
                  id="question"
                  value={newQuiz.question}
                  onChange={(e) => setNewQuiz({...newQuiz, question: e.target.value})}
                  placeholder="Enter your quiz question here..."
                  className="bg-gray-700 border-gray-600 text-white min-h-[100px] resize-none"
                  required
                />
              </div>

              <div className="space-y-4">
                <Label className="text-sm font-medium text-gray-300">
                  Quiz Options
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((num) => (
                    <div key={num} className="space-y-2">
                      <Label htmlFor={`option${num}`} className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <span>Option {num}</span>
                        <span className="text-red-400">*</span>
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
                  <span>Correct Answer</span>
                  <span className="text-red-400">*</span>
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
                          ? 'bg-green-500/20 border-green-500 shadow-lg shadow-green-500/20 scale-[1.02]' 
                          : 'bg-gray-700/80 border-gray-600 hover:bg-gray-600/80 hover:border-gray-500 hover:scale-[1.01]'
                        }
                      `}
                    >
                      <RadioGroupItem 
                        value={(num - 1).toString()} 
                        id={`correct${num}`}
                        className={`
                          w-5 h-5 border-2
                          ${newQuiz.correctAnswer === num - 1 
                            ? 'border-green-500 text-green-500 bg-green-500/20' 
                            : 'border-gray-400 text-gray-400 hover:border-green-400'
                          }
                        `}
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
                        
                      {newQuiz.correctAnswer === num - 1 && (
                        <div className="flex-shrink-0">
                          <div className="flex items-center gap-1 text-green-500">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="text-xs font-medium">Correct</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </RadioGroup>
                
                {newQuiz.correctAnswer !== null && newQuiz[`option${newQuiz.correctAnswer + 1}` as keyof typeof newQuiz] && (
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-green-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-sm font-medium">Correct Answer Preview:</span>
                    </div>
                    <p className="text-sm text-green-300 mt-1 ml-6">
                      "{newQuiz[`option${newQuiz.correctAnswer + 1}` as keyof typeof newQuiz]}"
                    </p>
                  </div>
                )}
              </div>
            </form>
          </div>
              
          <div className="flex-shrink-0 border-t border-gray-700 pt-4 mt-2">
            <div className="flex gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowQuizDialog(false)}
                className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                onClick={handleCreateQuiz}
                className="flex-1 bg-green-600 hover:bg-green-700 shadow-lg hover:shadow-green-500/25"
                disabled={!newQuiz.question || !newQuiz.option1 || !newQuiz.option2 || !newQuiz.option3 || !newQuiz.option4}
              >
                <Award className="w-4 h-4 mr-2" />
                Create Quiz
              </Button>
            </div>
          </div>
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
              {hasSubmitted ? 'Review your answer and the correct solution' : 'Answer the question below'}
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
                              : 'bg-gray-700/50 border-gray-600/50'
                          : 'bg-gray-700/80 border-gray-600 hover:bg-gray-600/80 hover:border-gray-500'
                        }
                        ${!hasSubmitted && 'cursor-pointer'}
                      `}
                      onClick={() => !hasSubmitted && setSelectedOption(index)}
                    >
                      <div className="flex items-center h-5 mt-0.5">
                        {hasSubmitted ? (
                          isCorrectAnswer ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : isStudentWrong ? (
                            <XCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <div className="w-5 h-5 border-2 border-gray-500 rounded-full" />
                          )
                        ) : (
                          <div className={`
                            w-5 h-5 border-2 rounded-full flex items-center justify-center
                            ${selectedOption === index 
                              ? 'border-blue-500 bg-blue-500/20' 
                              : 'border-gray-400'
                            }
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
                                : 'text-gray-400'
                            : selectedOption === index 
                              ? 'text-blue-300'
                              : 'text-gray-300'
                          }
                        `}>
                          {option}
                        </div>
                      </div>
                        
                      {hasSubmitted && (
                        <div className="flex-shrink-0 ml-2">
                          {isCorrectAnswer && (
                            <div className="flex items-center gap-1 text-green-500">
                              <span className="text-sm font-medium">Correct Answer</span>
                            </div>
                          )}
                          {isStudentWrong && (
                            <div className="flex items-center gap-1 text-red-500">
                              <span className="text-sm font-medium">Your Answer</span>
                            </div>
                          )}
                          {isStudentCorrect && (
                            <div className="flex items-center gap-1 text-green-500">
                              <CheckCircle2 className="w-4 h-4" />
                              <span className="text-sm font-medium">Your Answer ✓</span>
                            </div>
                          )}
                        </div>
                      )}
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
                      disabled={selectedOption === null}
                      className={`
                        flex-1 transition-all duration-200
                        ${selectedOption === null 
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                          : 'bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-blue-500/25'
                        }
                      `}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Submit Answer
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
        <DialogContent className="bg-gray-800 border-gray-700 text-white max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Quiz Results</DialogTitle>
            <DialogDescription className="text-gray-400">
              Results for: {activeQuiz?.question}
              {quizResponses.length > 0 && (
                <span className="ml-2 text-green-400">
                  • {quizResponses.length} total responses
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
            
          {activeQuiz && (
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 -mr-2">
              {process.env.NODE_ENV === 'development' && (
                <div className="bg-blue-900/20 p-3 rounded-lg border border-blue-700">
                  <p className="text-sm text-blue-300">
                    <strong>Debug:</strong> Quiz ID: {activeQuiz.id} | 
                    Responses: {quizResponses.length} | 
                    Students in class: {students.length}
                  </p>
                </div>
              )}
      
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-400">{totalResponses}</p>
                  <p className="text-sm text-gray-400">Total Responses</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {students.length} students in class
                  </p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-400">{correctCount}</p>
                  <p className="text-sm text-gray-400">Correct Answers</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {accuracy}% accuracy
                  </p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                  <p className="text-2xl font-bold text-yellow-400">
                    {students.length > 0 ? Math.round((totalResponses / students.length) * 100) : 0}%
                  </p>
                  <p className="text-sm text-gray-400">Participation</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {totalResponses}/{students.length} responded
                  </p>
                </div>
              </div>
            
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Response Breakdown
                </h4>
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
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Student Responses ({quizResponses.length})
                  </h4>
                  {quizResponses.length === 0 && (
                    <Badge variant="outline" className="text-orange-400 border-orange-400">
                      Waiting for responses...
                    </Badge>
                  )}
                </div>
                
                {quizResponses.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto space-y-2 border border-gray-600 rounded-lg p-2">
                    {quizResponses.map((response) => (
                      <div 
                        key={response.id} 
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
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
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                            <span>Selected: <strong>{activeQuiz.options[response.selectedOption]}</strong></span>
                            <span>•</span>
                            <span>
                              {response.submittedAt ? new Date(response.submittedAt).toLocaleTimeString() : 'Unknown time'}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-medium ${response.isCorrect ? 'text-green-400' : 'text-red-400'}`}>
                            {response.isCorrect ? 'Correct' : 'Incorrect'}
                          </p>
                          <p className="text-xs text-gray-400">
                            Option {response.selectedOption + 1}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-700/50 rounded-lg border border-gray-600">
                    <Users className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400">No responses yet</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Waiting for students to submit their answers...
                    </p>
                  </div>
                )}
              </div>
              
              {quizResponses.length > 0 && (
                <div className="bg-gray-700/50 p-4 rounded-lg border border-gray-600">
                  <h5 className="font-medium mb-2 text-sm text-gray-300">Quick Stats</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Fastest Response: </span>
                      <span className="text-green-400">
                        {quizResponses.length > 0 
                          ? new Date(Math.min(...quizResponses.map(r => r.submittedAt?.getTime() || Date.now()))).toLocaleTimeString()
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Latest Response: </span>
                      <span className="text-blue-400">
                        {quizResponses.length > 0 
                          ? new Date(Math.max(...quizResponses.map(r => r.submittedAt?.getTime() || Date.now()))).toLocaleTimeString()
                          : 'N/A'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
      
          <div className="flex-shrink-0 border-t border-gray-700 pt-4 mt-2">
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
                disabled={quizResponses.length === 0}
              >
                {quizResponses.length === 0 ? 'No Responses Yet' : 'Close Quiz'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}