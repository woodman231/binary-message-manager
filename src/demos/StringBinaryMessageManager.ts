import { BinaryMessageManager } from "../index.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class StringBinaryMessageManager extends BinaryMessageManager<string> {
    static readonly MESSAGE_TYPE_TEXT = 0x01;

    encode(message: string): Uint8Array {
        return textEncoder.encode(message);
    }

    decode(message: Uint8Array): string {
        return textDecoder.decode(message);
    }

    frameBuffer(buffer: Uint8Array): Uint8Array {
        // Frame format: [4 bytes length][1 byte type][payload]
        const framedBuffer = new Uint8Array(4 + 1 + buffer.length);
        const view = new DataView(framedBuffer.buffer);
        view.setUint32(0, buffer.length, true); // payload length (excludes header)
        framedBuffer[4] = StringBinaryMessageManager.MESSAGE_TYPE_TEXT; // type byte
        framedBuffer.set(buffer, 5); // payload
        return framedBuffer;
    }

    deframeBuffer(buffer: Uint8Array): Uint8Array {
        // Skip 4-byte length + 1-byte type
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const length = view.getUint32(0, true);
        const type = buffer[4]; // Could validate/use this
        return buffer.subarray(5, 5 + length);
    }

    getFramedMessageLength(buffer: Uint8Array): number {
        // 4 bytes length + 1 byte type + payload
        const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const payloadLength = view.getUint32(0, true);
        return 4 + 1 + payloadLength;
    }
}