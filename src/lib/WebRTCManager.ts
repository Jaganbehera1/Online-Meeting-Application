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
    
    // Validate that at least one media type is requested
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
        console.log('Adding track to peer connection:', track.kind, track.id);
        if (peerConnection.signalingState !== 'closed') {
          peerConnection.addTrack(track, this.localStream!);
        }
      });
    }

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from:', studentId, event.streams);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        this.remoteStreams.set(studentId, remoteStream);
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('remote-stream-added', {
          detail: { studentId, stream: remoteStream }
        }));
        
        // Listen for track ended events
        remoteStream.getTracks().forEach(track => {
          track.onended = () => {
            console.log('Remote track ended:', studentId, track.kind);
            this.remoteStreams.delete(studentId);
            window.dispatchEvent(new CustomEvent('remote-stream-removed', {
              detail: { studentId }
            }));
          };
        });
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Generated ICE candidate for:', studentId);
        // Convert to plain object for Firebase
        const candidateData: RTCIceCandidateInit = {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid || null,
          sdpMLineIndex: event.candidate.sdpMLineIndex || null,
          usernameFragment: event.candidate.usernameFragment || null
        };
        
        // Send candidate to signaling server (Firebase)
        window.dispatchEvent(new CustomEvent('ice-candidate', {
          detail: { studentId, candidate: candidateData }
        }));
      } else {
        console.log('ICE gathering complete for:', studentId);
      }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log(`ICE connection state for ${studentId}:`, state);
      this.connectionStates.set(studentId, state);
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
      } else if (state === 'disconnected' || state === 'failed') {
        window.dispatchEvent(new CustomEvent('peer-disconnected', {
          detail: { studentId }
        }));
      }
    };

    // Handle signaling state
    peerConnection.onsignalingstatechange = () => {
      console.log(`Signaling state for ${studentId}:`, peerConnection.signalingState);
    };

    this.peerConnections.set(studentId, peerConnection);
    return peerConnection;
  }

// In WebRTCManager.ts - enhance the createOffer method
async createOffer(studentId: string): Promise<RTCSessionDescriptionInit> {
  console.log('Creating offer for:', studentId);
  
  // Ensure any existing connection is properly closed
  if (this.peerConnections.has(studentId)) {
    const existingPC = this.peerConnections.get(studentId);
    if (existingPC && existingPC.signalingState !== 'closed') {
      console.log('Closing existing connection before creating new offer');
      this.closeConnection(studentId);
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
    // Clean up on failure
    this.closeConnection(studentId);
    throw error;
  }
}

// Add this method to check connection health
checkConnectionHealth(studentId: string): boolean {
  const pc = this.peerConnections.get(studentId);
  if (!pc) return false;
  
  const connectionState = pc.connectionState;
  const iceState = pc.iceConnectionState;
  
  return connectionState === 'connected' && 
         (iceState === 'connected' || iceState === 'completed');
}

// In WebRTCManager.ts - Update the handleAnswer method
async handleAnswer(studentId: string, answer: RTCSessionDescriptionInit): Promise<void> {
  console.log('Handling answer from:', studentId);
  const peerConnection = this.peerConnections.get(studentId);
  
  if (!peerConnection) {
    console.error('No peer connection found for:', studentId);
    throw new Error('No peer connection found');
  }

  // Check if we're in the right state to handle an answer
  if (peerConnection.signalingState !== 'have-local-offer') {
    console.warn(`Wrong signaling state for answer: ${peerConnection.signalingState}, expected: have-local-offer. Skipping duplicate answer.`);
    return; // Just return silently for duplicate answers
  }

  try {
    await peerConnection.setRemoteDescription(answer);
    console.log('Answer set as remote description successfully');

    // Process any pending ICE candidates
    const pending = this.pendingCandidates.get(studentId) || [];
    if (pending.length > 0) {
      console.log(`Processing ${pending.length} pending ICE candidates for:`, studentId);
      for (const candidate of pending) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding pending ICE candidate:', error);
        }
      }
      this.pendingCandidates.set(studentId, []);
    }
  } catch (error) {
    console.error('Error handling answer:', error);
    // Don't throw for duplicate answers, just log
    if ((error as Error).name === 'InvalidStateError') {
      console.warn('Duplicate answer received, ignoring...');
      return;
    }
    throw error;
  }
}

  async handleOffer(studentId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    console.log('Handling offer from:', studentId);
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
      throw error;
    }
  }

  async addIceCandidate(studentId: string, candidateData: RTCIceCandidateInit): Promise<void> {
    const peerConnection = this.peerConnections.get(studentId);
    if (!peerConnection) {
      console.error('No peer connection found for ICE candidate:', studentId);
      return;
    }

    // If remote description isn't set yet, store the candidate for later
    if (!peerConnection.remoteDescription) {
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
      // Still store it for potential later use
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
      peerConnection.close();
      this.peerConnections.delete(studentId);
      this.remoteStreams.delete(studentId);
      this.connectionStates.delete(studentId);
      this.pendingCandidates.delete(studentId);
    }
  }

  closeAllConnections(): void {
    console.log('Closing all peer connections');
    this.peerConnections.forEach((connection) => {
      connection.close();
    });
    this.peerConnections.clear();
    this.remoteStreams.clear();
    this.connectionStates.clear();
    this.pendingCandidates.clear();
  }

  stopLocalStream(): void {
    console.log('Stopping local stream');
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind, track.id);
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

  // Update stream tracks when toggling audio/video
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

  // Check if connection exists and is valid
  hasConnection(studentId: string): boolean {
    const pc = this.peerConnections.get(studentId);
    return pc != null && pc.signalingState !== 'closed';
  }
}