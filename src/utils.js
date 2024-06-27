import pako from 'pako';
import extractChunks from "png-chunks-extract";
import text from "png-chunk-text";
import imageCompression from 'browser-image-compression';

class DataReader {
    constructor(data) {
        this.data = data;
        this.index = 0;
    }

    readBit() {
        return this.data[this.index++];
    }

    readNBits(n) {
        let bits = [];
        for (let i = 0; i < n; i++) {
            bits.push(this.readBit());
        }
        return bits;
    }

    readByte() {
        let byte = 0;
        for (let i = 0; i < 8; i++) {
            byte |= this.readBit() << (7 - i);
        }
        return byte;
    }

    readNBytes(n) {
        let bytes = [];
        for (let i = 0; i < n; i++) {
            bytes.push(this.readByte());
        }
        return bytes;
    }

    readInt32() {
        let bytes = this.readNBytes(4);
        return new DataView(new Uint8Array(bytes).buffer).getInt32(0, false);
    }
}

async function getChunks(bytes) {
    let chunks = [];
    try {
        chunks = extractChunks(new Uint8Array(bytes));
    } catch (err) {
        return chunks;
    }
    const textChunks = chunks
        .filter(function (chunk) {
            return chunk.name === "tEXt" || chunk.name === "iTXt";
        })
        .map(function (chunk) {
            if (chunk.name === "iTXt") {
                let data = chunk.data.filter((x) => x != 0x0);
                let header = new TextDecoder().decode(data.slice(0, 11));
                if (header == "Description") {
                    data = data.slice(11);
                    let txt = new TextDecoder().decode(data);
                    return {
                        keyword: "Description",
                        text: txt,
                    };
                } else {
                    let txt = new TextDecoder().decode(data);
                    return {
                        keyword: "Unknown",
                        text: txt,
                    };
                }
            } else {
                return text.decode(chunk.data);
            }
        });
    return textChunks;
}

async function getPngMetadata(bytes) {
    const chunks = await getChunks(bytes);
    const json = {};
    chunks.forEach(chunk => {
        json[chunk['keyword']] = chunk['text'];
    });
    return json;
}

async function getStealthExif(bytes) {
    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });

    let blob = new Blob([bytes], { type: 'image/png' });
    let url = URL.createObjectURL(blob);
    let img = new Image();
    img.src = url;

    await img.decode();

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    let imageData = ctx.getImageData(0, 0, img.width, img.height);
    let lowestData = [];

    for (let x = 0; x < img.width; x++) {
        for (let y = 0; y < img.height; y++) {
            let index = (y * img.width + x) * 4;
            let a = imageData.data[index + 3];
            lowestData.push(a & 1);
        }
    }
    URL.revokeObjectURL(url);

    const magic = "stealth_pngcomp";
    const reader = new DataReader(lowestData);
    const readMagic = reader.readNBytes(magic.length);
    const magicString = String.fromCharCode.apply(null, readMagic);

    if (magic === magicString) {
        const dataLength = reader.readInt32();
        const gzipData = reader.readNBytes(dataLength / 8);
        const data = pako.ungzip(new Uint8Array(gzipData));
        const jsonString = new TextDecoder().decode(new Uint8Array(data));
        const json = JSON.parse(jsonString);
        return json;
    } else {
        console.log("Magic number not found.");
    }

    return null;
}

export async function getImageData(bytes) {
    try {
        let json = await getPngMetadata(bytes);
        if (Object.keys(json).length === 0) {
            json = await getStealthExif(bytes);
        }
        return json;
    } catch (err) {
        console.error('Error reading image data:', error);
        return null;
    }
}

export async function compressWithBIC(imageBase64, quality) {
    const imageFile = await fetch(imageBase64)
        .then(res => res.blob())
        .then(blob => new File([blob], 'image.png', { type: blob.type }));

    const options = {
        maxSizeMB: 10,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        quality: quality
    };
    try {
        const compressedFile = await imageCompression(imageFile, options);
        const compressedBase64 = await imageCompression.getDataUrlFromFile(compressedFile);
        return compressedBase64;
    } catch (error) {
        console.error('Error during image compression:', error);
    }
}

import { optimizeImage } from 'wasm-image-optimization/esm';

// async function loadWasm() {
//     const response = await fetch('/libImage.wasm');
//     const wasmArrayBuffer = await response.arrayBuffer();
//     await init(wasmArrayBuffer);
// }

// await loadWasm();

// 将图像转换为 ArrayBuffer
async function base64ToArrayBuffer(base64) {
    const response = await fetch(base64);
    return await response.arrayBuffer();
}

// 将 ArrayBuffer 转换为 Base64
function arrayBufferToBase64(buffer, mimeType) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return `data:${mimeType};base64,` + btoa(binary);
}

// 图像压缩函数
export async function compress(imageBase64, quality) {
    try {
        const arrayBuffer = await base64ToArrayBuffer(imageBase64);
        const optimizedImageBuffer = await optimizeImage({
            image: arrayBuffer,
            quality: Math.round(quality * 100),
            format: 'webp',
        });
        const mimeType = 'image/webp';
        return arrayBufferToBase64(optimizedImageBuffer, mimeType);
    } catch (error) {
        console.error('Error during image compression:', error);
        throw error;
    }
}