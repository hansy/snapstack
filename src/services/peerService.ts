import Peer, { DataConnection } from 'peerjs';
import { useGameStore } from '../store/gameStore';

type MessageType = 'SYNC_STATE' | 'ACTION';

interface Message {
    type: MessageType;
    payload: any;
}

class PeerService {
    peer: Peer | null = null;
    connections: DataConnection[] = [];
    hostConnection: DataConnection | null = null;

    constructor() {
        // Do not initialize Peer immediately
    }

    initialize(myId?: string): Promise<string> {
        return new Promise((resolve, _reject) => {
            if (this.peer) {
                resolve(this.peer.id);
                return;
            }

            this.peer = myId ? new Peer(myId) : new Peer();

            this.peer.on('open', (id) => {
                console.log('My peer ID is: ' + id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
            });
        });
    }

    connectToHost(hostId: string) {
        if (!this.peer) return;
        const conn = this.peer.connect(hostId);
        this.hostConnection = conn;

        conn.on('open', () => {
            console.log('Connected to host: ' + hostId);
            // Request initial state? Or wait for host to send it?
        });

        conn.on('data', (data) => {
            this.handleMessage(data as Message);
        });
    }

    handleConnection(conn: DataConnection) {
        this.connections.push(conn);

        conn.on('open', () => {
            console.log('Peer connected: ' + conn.peer);
            // If I am host, send current state
            const state = useGameStore.getState();
            this.sendToPeer(conn, { type: 'SYNC_STATE', payload: state });
        });

        conn.on('data', (data) => {
            this.handleMessage(data as Message);
            // If I am host, broadcast to others?
            // Simple mesh or star topology? Star is easier for consistency.
            // If I am host, I receive action, apply it, then broadcast to others.
        });

        conn.on('close', () => {
            this.connections = this.connections.filter(c => c !== conn);
        });
    }

    handleMessage(message: Message) {
        console.log('Received message: ' + JSON.stringify(message));
        switch (message.type) {
            case 'SYNC_STATE':
                useGameStore.setState(message.payload);
                break;
            case 'ACTION':
                const { action, args } = message.payload;
                const store = useGameStore.getState() as any;
                if (typeof store[action] === 'function') {
                    // Call action with isRemote = true
                    store[action](...args, true);
                }
                break;
        }
    }

    sendToPeer(conn: DataConnection, message: Message) {
        conn.send(message);
    }

    broadcast(message: Message) {
        this.connections.forEach(conn => this.sendToPeer(conn, message));
        if (this.hostConnection) {
            this.sendToPeer(this.hostConnection, message);
        }
    }
}

export const peerService = new PeerService();
