export class WebRTCManager {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private isInitialized = false;
  private connectionStates: Map<string, string> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  
  private configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  async initializeLocalStream(audio: boolean = true, video: boolean = true): Promise<MediaStream> {
    try {
      console.log('Initializing local stream with audio:', audio, 'video:', video);
      
      if (!audio && !video) {
        throw new Error('At least one of audio or video must be requested');
      }

      const constraints: MediaStreamConstraints = {
        video: video ? {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 2
        } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('Local stream obtained:', this.localStream.id);
      this.isInitialized = true;
      return this.localStream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }

  createPeerConnection(studentId: string): RTCPeerConnection {
    console.log('Creating peer connection for:', studentId);
    
    // Close existing connection if it exists
    if (this.peerConnections.has(studentId)) {
      console.log('Closing existing connection for:', studentId);
      this.closeConnection(studentId);
    }

    const peerConnection = new RTCPeerConnection(this.configuration);
    this.connectionStates.set(studentId, 'new');
    this.pendingCandidates.set(studentId, []);

    // Add local tracks to connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        if (peerConnection.signalingState !== 'closed') {
          try {
            peerConnection.addTrack(track, this.localStream!);
            console.log('Added track to peer connection:', track.kind, track.id);
          } catch (error) {
            console.error('Error adding track:', error);
          }
        }
      });
    }

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from:', studentId, event.streams.length, 'streams');
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        this.remoteStreams.set(studentId, remoteStream);
        
        window.dispatchEvent(new CustomEvent('remote-stream-added', {
          detail: { studentId, stream: remoteStream }
        }));
        
        console.log('Remote stream added for:', studentId);
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateData: RTCIceCandidateInit = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid || null,
          sdpMLineIndex: event.candidate.sdpMLineIndex || null,
          usernameFragment: event.candidate.usernameFragment || null
        };
        
        window.dispatchEvent(new CustomEvent('ice-candidate', {
          detail: { studentId, candidate: candidateData }
        }));
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log(`Connection state for ${studentId}:`, state);
      this.connectionStates.set(studentId, state);
      
      if (state === 'connected') {
        window.dispatchEvent(new CustomEvent('peer-connected', {
          detail: { studentId }
        }));
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        window.dispatchEvent(new CustomEvent('peer-disconnected', {
          detail: { studentId }
        }));
        this.remoteStreams.delete(studentId);
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log(`ICE connection state for ${studentId}:`, state);
      
      if (state === 'disconnected' || state === 'failed') {
        window.dispatchEvent(new CustomEvent('peer-disconnected', {
          detail: { studentId }
        }));
      }
    };

    this.peerConnections.set(studentId, peerConnection);
    return peerConnection;
  }

  async createOffer(studentId: string): Promise<RTCSessionDescriptionInit> {
    console.log('Creating offer for:', studentId);
    
    // Clean up any existing connection
    if (this.peerConnections.has(studentId)) {
      this.closeConnection(studentId);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const peerConnection = this.createPeerConnection(studentId);
    
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      console.log('Offer created successfully, signaling state:', peerConnection.signalingState);
      return offer;
    } catch (error) {
      console.error('Error creating offer:', error);
      this.closeConnection(studentId);
      throw error;
    }
  }

  async handleAnswer(studentId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('Handling answer from:', studentId);
    const peerConnection = this.peerConnections.get(studentId);
    
    if (!peerConnection) {
      console.error('No peer connection found for:', studentId);
      throw new Error('No peer connection found');
    }

    // Check if we're in the right state to handle an answer
    const signalingState = peerConnection.signalingState;
    if (signalingState !== 'have-local-offer') {
      console.warn(`Cannot handle answer in state: ${signalingState}, expected: have-local-offer`);
      return;
    }

    try {
      await peerConnection.setRemoteDescription(answer);
      console.log('Answer set as remote description successfully');

      // Process pending ICE candidates
      const pending = this.pendingCandidates.get(studentId) || [];
      for (const candidate of pending) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding pending ICE candidate:', error);
        }
      }
      this.pendingCandidates.set(studentId, []);
    } catch (error) {
      console.error('Error handling answer:', error);
      if ((error as Error).name === 'InvalidStateError') {
        console.warn('Duplicate answer received, ignoring...');
        return;
      }
      throw error;
    }
  }

  async handleOffer(studentId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    console.log('Handling offer from:', studentId);
    
    // Clean up any existing connection
    if (this.peerConnections.has(studentId)) {
      this.closeConnection(studentId);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const peerConnection = this.createPeerConnection(studentId);
    
    try {
      await peerConnection.setRemoteDescription(offer);
      console.log('Offer set as remote description successfully');

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      console.log('Answer created successfully');
      return answer;
    } catch (error) {
      console.error('Error handling offer:', error);
      this.closeConnection(studentId);
      throw error;
    }
  }

  async addIceCandidate(studentId: string, candidateData: RTCIceCandidateInit): Promise<void> {
    const peerConnection = this.peerConnections.get(studentId);
    if (!peerConnection) {
      console.log('Storing ICE candidate for later processing:', studentId);
      const pending = this.pendingCandidates.get(studentId) || [];
      pending.push(candidateData);
      this.pendingCandidates.set(studentId, pending);
      return;
    }

    try {
      const iceCandidate = new RTCIceCandidate(candidateData);
      await peerConnection.addIceCandidate(iceCandidate);
      console.log('ICE candidate added for:', studentId);
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
      // Store for potential later use
      const pending = this.pendingCandidates.get(studentId) || [];
      pending.push(candidateData);
      this.pendingCandidates.set(studentId, pending);
    }
  }

  getRemoteStream(studentId: string): MediaStream | undefined {
    return this.remoteStreams.get(studentId);
  }

  getAllRemoteStreams(): Map<string, MediaStream> {
    return new Map(this.remoteStreams);
  }

  closeConnection(studentId: string): void {
    console.log('Closing connection for:', studentId);
    const peerConnection = this.peerConnections.get(studentId);
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
      this.peerConnections.delete(studentId);
    }
    this.remoteStreams.delete(studentId);
    this.connectionStates.delete(studentId);
    this.pendingCandidates.delete(studentId);
  }

  closeAllConnections(): void {
    console.log('Closing all peer connections');
    this.peerConnections.forEach((_connection, studentId) => {
      this.closeConnection(studentId);
    });
  }

  stopLocalStream(): void {
    console.log('Stopping local stream');
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
    this.isInitialized = false;
  }

  isStreamInitialized(): boolean {
    return this.isInitialized;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getConnectionState(studentId: string): string | undefined {
    return this.connectionStates.get(studentId);
  }

  getSignalingState(studentId: string): string | undefined {
    return this.peerConnections.get(studentId)?.signalingState;
  }

  getActiveConnections(): string[] {
    return Array.from(this.peerConnections.keys());
  }

  updateLocalStreamTracks(audioEnabled: boolean, videoEnabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = audioEnabled;
      });
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = videoEnabled;
      });
    }
  }

  hasConnection(studentId: string): boolean {
    const pc = this.peerConnections.get(studentId);
    return pc != null && pc.connectionState !== 'closed' && pc.signalingState !== 'closed';
  }

  // New method to check if connection is healthy
  isConnectionHealthy(studentId: string): boolean {
    const pc = this.peerConnections.get(studentId);
    if (!pc) return false;
    
    return pc.connectionState === 'connected' && 
           (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
  }
}