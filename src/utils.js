import extractChunks from "png-chunks-extract";
import text from "png-chunk-text";
import { optimizeImage } from 'wasm-image-optimization/esm';
import init, { decode_image_data } from 'stealth-watermark-reader';

let initWasmReader = false;
let initPromise = null;

async function initWasm() {
    if (!initPromise) { // 如果还没有初始化过，创建一个新的 promise
        initPromise = init().then(() => {
            initWasmReader = true;
            console.log("Wasm pack init");
        });
    }
    return initPromise; // 返回初始化 promise
}

async function getChunks(bytes) {
    let chunks = [];
    try {
        chunks = extractChunks(bytes);
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
    await initWasm();

    try {
        // decode_image_data 函数调用，正确处理异步和错误
        const jsonString = decode_image_data(bytes);
        const json = JSON.parse(jsonString);  // 尝试解析 JSON
        return json;
    } catch (error) {
        // 错误处理，包括来自 Rust 的错误和 JSON 解析错误
        console.log("Error parsing image data: " + error);
        return null;
    }
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
