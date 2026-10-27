import { describe, it, expect, vi } from 'vitest';
import {
  BroadcastChannelTransport,
  LocalSignallingBroker,
  WebRTCTransport,
} from './webrtcTransport';
import type { MultiplayerPacket } from './protocol';

describe('Multiplayer WebRTC & Signalling Transport', () => {
  it('instantiates and closes BroadcastChannelTransport cleanly', () => {
    const transport = new BroadcastChannelTransport('test_room');
    expect(transport.type).toBe('broadcast');

    const received: MultiplayerPacket[] = [];
    transport.onMessage((pkt) => received.push(pkt));

    transport.send({
      type: 'ping',
      timestamp: 12345,
    });

    transport.close();
    expect(transport.type).toBe('broadcast');
  });

  it('exchanges signalling messages via LocalSignallingBroker', () => {
    const broker1 = new LocalSignallingBroker();
    const broker2 = new LocalSignallingBroker();

    broker1.connect('signalling_room', 'peer1');
    broker2.connect('signalling_room', 'peer2');

    const broker2Received: unknown[] = [];
    broker2.onSignal((msg) => broker2Received.push(msg));

    broker1.send({
      type: 'offer',
      roomId: 'signalling_room',
      senderId: 'peer1',
      targetId: 'peer2',
    });

    broker1.close();
    broker2.close();
  });

  it('gracefully handles missing RTCPeerConnection in Node/SSR environment', () => {
    const transport = new WebRTCTransport({
      isHost: true,
      roomId: 'room_fallback',
      localPeerId: 'peer_node',
    });

    expect(transport.type).toBe('webrtc');
    // Sending should not throw even if disconnected/unsupported
    expect(() => {
      transport.send({
        type: 'ping',
        timestamp: Date.now(),
      });
    }).not.toThrow();

    transport.close();
  });
});
