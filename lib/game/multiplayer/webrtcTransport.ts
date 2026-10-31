import type { Peer as PeerType, DataConnection } from 'peerjs';
import {
  deserializePacket,
  serializePacket,
  type MultiplayerPacket,
} from './protocol';

export type TransportType = 'broadcast' | 'webrtc' | 'online';

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

export interface OnlinePeerOptions {
  isHost: boolean;
  roomId: string;
  localPeerId: string;
  onConnected?: () => void;
  onError?: (err: unknown) => void;
}

/**
 * Real online peer-to-peer transport using WebRTC data channels via PeerJS cloud signalling (0.peerjs.com).
 * Also mirrors packets to local BroadcastChannel for zero-latency multi-tab development on the same device.
 */
export class OnlinePeerTransport implements MultiplayerTransport {
  readonly type = 'online';
  private peer: PeerType | null = null;
  private connections: DataConnection[] = [];
  private localChannel: BroadcastChannel | null = null;
  private messageHandler: ((packet: MultiplayerPacket) => void) | null = null;
  private isHost: boolean;
  private roomId: string;
  private localPeerId: string;
  private isClosed = false;
  private sendQueue: MultiplayerPacket[] = [];

  constructor(options: OnlinePeerOptions) {
    this.isHost = options.isHost;
    this.roomId = options.roomId;
    this.localPeerId = options.localPeerId;

    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.localChannel = new BroadcastChannel(`f1_room_${options.roomId}`);
        this.localChannel.onmessage = (ev) => {
          const packet = deserializePacket(ev.data);
          if (packet && this.messageHandler) {
            this.messageHandler(packet);
          }
        };
      } catch (e) {
        console.debug('[OnlinePeerTransport] Local broadcast fallback disabled:', e);
      }
    }

    this.initPeer(options);
  }

  private async initPeer(options: OnlinePeerOptions) {
    if (typeof window === 'undefined') return;
    try {
      const { Peer } = await import('peerjs');
      if (this.isClosed) return;

      const hostPeerId = `openrace_${this.roomId.toLowerCase()}`;
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      if (this.isHost) {
        this.peer = new Peer(hostPeerId, {
          config: { iceServers },
          debug: 1,
        });

        this.peer.on('open', (id) => {
          console.log('[OnlinePeer] Host peer online with ID:', id);
          options.onConnected?.();
        });

        this.peer.on('connection', (conn) => {
          console.log('[OnlinePeer] Incoming guest connection from:', conn.peer);
          this.connections.push(conn);

          conn.on('open', () => {
            console.log('[OnlinePeer] Guest data channel open with:', conn.peer);
            this.flushQueue();
            options.onConnected?.();
          });

          conn.on('data', (data) => {
            const raw = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
            const packet = deserializePacket(raw);
            if (packet && this.messageHandler) {
              this.messageHandler(packet);
            }
          });

          conn.on('close', () => {
            this.connections = this.connections.filter((c) => c !== conn);
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[OnlinePeer] Host peer error:', err);
          options.onError?.(err);
        });
      } else {
        // Guest/Client connects to host
        this.peer = new Peer({
          config: { iceServers },
          debug: 1,
        });

        this.peer.on('open', () => {
          console.log('[OnlinePeer] Guest peer ready, connecting to host:', hostPeerId);
          const conn = this.peer!.connect(hostPeerId, {
            reliable: false,
          });

          this.connections = [conn];

          conn.on('open', () => {
            console.log('[OnlinePeer] Connected to Host data channel!');
            this.flushQueue();
            options.onConnected?.();
          });

          conn.on('data', (data) => {
            const raw = typeof data === 'string' ? data : new TextDecoder().decode(data as ArrayBuffer);
            const packet = deserializePacket(raw);
            if (packet && this.messageHandler) {
              this.messageHandler(packet);
            }
          });

          conn.on('close', () => {
            this.connections = [];
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[OnlinePeer] Guest peer error:', err);
          options.onError?.(err);
        });
      }
    } catch (err) {
      console.error('[OnlinePeer] Error initializing PeerJS:', err);
      options.onError?.(err);
    }
  }

  private flushQueue() {
    if (this.sendQueue.length === 0) return;
    const queued = [...this.sendQueue];
    this.sendQueue = [];
    for (const pkt of queued) {
      this.send(pkt);
    }
  }

  send(packet: MultiplayerPacket): void {
    const raw = serializePacket(packet);
    let sentToPeer = false;

    for (const conn of this.connections) {
      if (conn.open) {
        try {
          conn.send(raw);
          sentToPeer = true;
        } catch (e) {
          console.debug('[OnlinePeer] Send failed:', e);
        }
      }
    }

    // Queue critical packets if connection is still handshaking
    if (!sentToPeer && (packet.type === 'join' || packet.type === 'room_sync' || packet.type === 'player_update')) {
      if (this.sendQueue.length < 20) {
        this.sendQueue.push(packet);
      }
    }

    // Mirror to local channel for same-machine tabs
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(raw);
      } catch (e) {}
    }
  }

  onMessage(handler: (packet: MultiplayerPacket) => void): void {
    this.messageHandler = handler;
  }

  close(): void {
    this.isClosed = true;
    for (const conn of this.connections) {
      try {
        conn.close();
      } catch (e) {}
    }
    this.connections = [];

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }

    if (this.localChannel) {
      try {
        this.localChannel.close();
      } catch (e) {}
      this.localChannel = null;
    }
    this.messageHandler = null;
  }
}
