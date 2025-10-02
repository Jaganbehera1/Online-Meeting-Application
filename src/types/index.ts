export type UserRole = 'teacher' | 'student';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  createdAt: Date;
}

export interface Class {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  scheduledAt: Date;
  duration: number;
  status: 'scheduled' | 'live' | 'completed' | 'cancelled';
  roomId: string;
  createdAt: Date;
  studentCount: number;
  isImmediate: boolean;
  students?: string[];
  startedAt?: Date;
  endedAt?: Date;
}

export interface Quiz {
  id: string;
  classId: string;
  teacherId: string;
  teacherName: string;
  question: string;
  options: string[];
  correctAnswer: number;
  createdAt: Date;
  isActive: boolean;
}

export interface QuizResponse {
  id: string;
  studentId: string;
  studentName: string;
  quizId: string;
  quizTitle: string;   // ✅ Add this line
  question: string;
  selectedOption: number;
  correctOption: string;
  isCorrect: boolean;
  submittedAt: Date;
  classId: string;
  score: number;
  totalQuestions: number;
}


export interface Slide {
  id: string;
  classId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: Date;
}
export interface StudentAttendance {
  id: string;
  classId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  joinedAt: Date;
  leftAt?: Date;
  duration?: number;
  status: 'present' | 'absent' | 'late';
}
export interface ScreenShare {
  id: string;
  classId: string;
  teacherId: string;
  teacherName: string;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date;
  streamId: string;
  streamInfo?: any;
}
export interface WebRTCSignal {
  id?: string;
  classId: string;
  fromUserId: string;
  targetUserId: string;
  type: 'offer' | 'answer' | 'ice-candidate' | 'join-request';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  createdAt: Date;
}