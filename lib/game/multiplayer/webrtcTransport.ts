import {
  deserializePacket,
  serializePacket,
  type MultiplayerPacket,
} from './protocol';

export type TransportType = 'broadcast' | 'webrtc';

export interface MultiplayerTransport {
  readonly type: TransportType;
  send(packet: MultiplayerPacket): void;
  onMessage(handler: (packet: MultiplayerPacket) => void): void;
  close(): void;
}

/**
 * Same-origin cross-tab transport utilizing BroadcastChannel.
 */
export class BroadcastChannelTransport implements MultiplayerTransport {
  readonly type = 'broadcast';
  private channel: BroadcastChannel | null = null;
  private messageHandler: ((packet: MultiplayerPacket) => void) | null = null;

  constructor(roomId: string) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`f1_room_${roomId}`);
      this.channel.onmessage = (ev) => {
        const packet = deserializePacket(ev.data);
        if (packet && this.messageHandler) {
          this.messageHandler(packet);
        }
      };
    }
  }

  send(packet: MultiplayerPacket): void {
    if (this.channel) {
      this.channel.postMessage(serializePacket(packet));
    }
  }

  onMessage(handler: (packet: MultiplayerPacket) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.messageHandler = null;
  }
}

export interface SignallingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'join' | 'leave';
  roomId: string;
  senderId: string;
  targetId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Signalling broker interface for exchanging WebRTC SDP offers/answers and ICE candidates.
 */
export interface SignallingBroker {
  connect(roomId: string, peerId: string): void;
  send(msg: SignallingMessage): void;
  onSignal(handler: (msg: SignallingMessage) => void): void;
  close(): void;
}

/**
 * In-memory / cross-tab broadcast signalling broker for local testing and multi-window peers.
 */
export class LocalSignallingBroker implements SignallingBroker {
  private channel: BroadcastChannel | null = null;
  private handler: ((msg: SignallingMessage) => void) | null = null;
  private roomId = '';
  private peerId = '';

  connect(roomId: string, peerId: string): void {
    this.roomId = roomId;
    this.peerId = peerId;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`f1_signal_${roomId}`);
      this.channel.onmessage = (ev) => {
        const msg = ev.data as SignallingMessage;
        if (msg && msg.senderId !== this.peerId && this.handler) {
          if (!msg.targetId || msg.targetId === this.peerId) {
            this.handler(msg);
          }
        }
      };
    }
  }

  send(msg: SignallingMessage): void {
    if (this.channel) {
      this.channel.postMessage(msg);
    }
  }

  onSignal(handler: (msg: SignallingMessage) => void): void {
    this.handler = handler;
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.handler = null;
  }
}

export interface WebRTCTransportOptions {
  isHost: boolean;
  roomId: string;
  localPeerId: string;
  targetPeerId?: string;
  broker?: SignallingBroker;
  rtcConfig?: RTCConfiguration;
}

/**
 * WebRTC DataChannel transport with signalling broker support.
 * Supports unreliable/unordered low-latency datagrams for 60Hz physics snapshots.
 */
export class WebRTCTransport implements MultiplayerTransport {
  readonly type = 'webrtc';
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private broker: SignallingBroker;
  private messageHandler: ((packet: MultiplayerPacket) => void) | null = null;
  private isHost: boolean;
  private roomId: string;
  private localPeerId: string;
  private targetPeerId?: string;

  constructor(options: WebRTCTransportOptions) {
    this.isHost = options.isHost;
    this.roomId = options.roomId;
    this.localPeerId = options.localPeerId;
    this.targetPeerId = options.targetPeerId;
    this.broker = options.broker ?? new LocalSignallingBroker();

    this.initPeerConnection(options.rtcConfig);
    this.initSignalling();
  }

  private initPeerConnection(config?: RTCConfiguration) {
    if (typeof RTCPeerConnection === 'undefined') return;

    const rtc = new RTCPeerConnection(config ?? {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.peerConnection = rtc;

    rtc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.broker.send({
          type: 'candidate',
          roomId: this.roomId,
          senderId: this.localPeerId,
          targetId: this.targetPeerId,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    if (this.isHost) {
      const dc = rtc.createDataChannel('game_stream', {
        ordered: false,
        maxRetransmits: 0,
      });
      this.bindDataChannel(dc);
    } else {
      rtc.ondatachannel = (ev) => {
        this.bindDataChannel(ev.channel);
      };
    }
  }

  private bindDataChannel(dc: RTCDataChannel) {
    this.dataChannel = dc;
    dc.onmessage = (ev) => {
      const packet = deserializePacket(typeof ev.data === 'string' ? ev.data : new TextDecoder().decode(ev.data));
      if (packet && this.messageHandler) {
        this.messageHandler(packet);
      }
    };
  }

  private initSignalling() {
    this.broker.connect(this.roomId, this.localPeerId);
    this.broker.onSignal(async (msg) => {
      if (!this.peerConnection) return;

      if (msg.type === 'offer' && !this.isHost && msg.sdp) {
        this.targetPeerId = msg.senderId;
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.broker.send({
          type: 'answer',
          roomId: this.roomId,
          senderId: this.localPeerId,
          targetId: msg.senderId,
          sdp: answer,
        });
      } else if (msg.type === 'answer' && this.isHost && msg.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      } else if (msg.type === 'candidate' && msg.candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    });

    if (this.isHost) {
      // Create initial offer
      this.createOffer().catch((err) => console.debug('WebRTC offer defer:', err));
    }
  }

  async createOffer(): Promise<void> {
    if (!this.peerConnection) return;
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    this.broker.send({
      type: 'offer',
      roomId: this.roomId,
      senderId: this.localPeerId,
      targetId: this.targetPeerId,
      sdp: offer,
    });
  }

  send(packet: MultiplayerPacket): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(serializePacket(packet));
    }
  }

  onMessage(handler: (packet: MultiplayerPacket) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.broker.close();
    this.messageHandler = null;
  }
}
