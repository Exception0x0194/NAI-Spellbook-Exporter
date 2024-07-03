import pako from 'pako';
import extractChunks from "png-chunks-extract";
import text from "png-chunk-text";
import { optimizeImage } from 'wasm-image-optimization/esm';
import init, { decode_image_data } from 'stealth-watermark-reader';

let init_wasm_image_reader = false;

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


async function getStealthExif(bytes, type = 'image/png') {
    if (!init_wasm_image_reader) {
        await init();
        init_wasm_image_reader = true;
        console.log("Wasm pack init");
    }

    try {
        // decode_image_data 函数调用，正确处理异步和错误
        const jsonString = decode_image_data(new Uint8Array(bytes));
        const json = JSON.parse(jsonString);  // 尝试解析 JSON
        return json;
    } catch (error) {
        // 错误处理，包括来自 Rust 的错误和 JSON 解析错误
        console.log("Error parsing image data: " + error);
        return null;
    }


    let canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: true });

    let blob = new Blob([bytes], { type: type });
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

export async function getImageData(bytes, type = 'image/png') {
    try {
        let json = await getPngMetadata(bytes);
        if (Object.keys(json).length === 0) {
            json = await getStealthExif(bytes, type);
        }
        return json;
    } catch (err) {
        console.error('Error reading image data:', error);
        return null;
    }
}

export async function compress(imageBase64, quality) {
    const imageBuffer = await (await fetch(imageBase64)).arrayBuffer();
    const mimeType = 'image/webp';
    const compressionOptions = {
        image: imageBuffer,
        quality: quality,
        format: "webp"  // 指定输出格式为 webp
    };
    try {
        const compressedBuffer = await optimizeImage(compressionOptions);
        const compressedBase64 = await arrayBufferToBase64(compressedBuffer, mimeType);
        return compressedBase64;
    } catch (error) {
        console.error('Error compressing image:', error);
        return null;  // 在压缩失败时返回 null
    }
}

async function arrayBufferToBase64(buffer, mimeType) {
    return new Promise((resolve, reject) => {
        const blob = new Blob([buffer], { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = function () {
            const base64data = reader.result;
            resolve(base64data);
        };
        reader.onerror = function (error) {
            reject('Error converting to base64: ' + error.message);
        };
        reader.readAsDataURL(blob);
    });
}
