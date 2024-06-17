import pako from 'pako';

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

export async function getStealthExif(bytes) {
    let time = performance.now();

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

    console.log("Time taken: ", performance.now() - time, "ms");
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