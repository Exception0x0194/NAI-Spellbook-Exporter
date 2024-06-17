<template>
    <div>
        <input type="file" @change="handleFiles" multiple accept="image/png" ref="fileInput" style="display: none;" />
        <button @click="triggerFileInput">添加文件</button>
        <button @click="clearFiles">清空文件</button>
        <button @click="exportSheet">导出到 HTML 表格</button>

        <p>待处理文件数量：{{ fileList.length }}</p>

        <div class="form-container">
            <div class="form-group">
                <label>
                    <input type="checkbox" v-model="compressImage"> 压缩图片
                    <span v-if="compressImage">&nbsp;← 将使用 JPG 压缩图片，缩小体积并清除水印信息</span>
                    <span v-else>&nbsp;← 将使用原本的 PNG 图片，保留原有的水印信息</span>
                </label>
            </div>

            <div class="form-group">
                <label>
                    每行高度：
                    <input type="range" v-model="rowHeight" min="128" max="1920" step="128">
                    <input type="number" v-model="rowHeight" min="128" max="1920">&nbsp;px
                </label>
            </div>

            <div class="form-group">
                <label>
                    每行图片数量：
                    <input type="range" v-model="itemsPerRow" min="1" max="10" step="1">
                    <input type="number" v-model="itemsPerRow" min="1" max="10">&nbsp;个
                </label>
            </div>
            <div v-if="compressImage">
                JPG 压缩品质：<input type="range" v-model="compressRatio" min="0.5" max="1" step="0.05">&nbsp;{{
                    Math.round(compressRatio * 100) }}%
            </div>
        </div>
        <div v-if="isLoading">
            <progress max="100" :value="progress">{{ progress }}%</progress>
        </div>
    </div>
</template>


<script>
import { ref } from 'vue';
import { getStealthExif, compress } from '../utils.js';
import { saveAs } from 'file-saver';

export default {
    setup() {
        const fileInput = ref(null);

        const fileList = ref([]);
        const metadataList = ref([]);
        const itemsPerRow = ref(3);
        const compressImage = ref(true);
        const compressSizeRatio = ref(1);
        const compressQuality = ref(1);
        const rowHeight = ref(512);
        const progress = ref(0);
        const isLoading = ref(false);

        const triggerFileInput = () => {
            if (fileInput.value) {
                fileInput.value.click();
            }
        };

        const handleFiles = (event) => {
            const input = event.target;
            if (input.files) {
                for (let i = 0; i < input.files.length; i++) {
                    const file = input.files[i];
                    const reader = new FileReader();

                    reader.onload = async (e) => {
                        try {
                            const arrayBuffer = e.target.result;
                            const metadata = await getStealthExif(arrayBuffer);
                            if (metadata) {
                                fileList.value.push(file);
                                metadataList.value.push(metadata);
                            } else {
                                console.error('Could not find watermark in image.');
                            }
                        } catch (error) {
                            console.error('Error reading file:', error);
                        }
                    };

                    reader.readAsArrayBuffer(file);
                }
            }
        };

        const clearFiles = () => {
            fileList.value = [];
            metadataList.value = [];
        };

        const exportSheet = () => {
            if (fileList.value.length == 0) {
                return;
            }
            isLoading.value = true;
            progress.value = 0;
            let htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Spellbook</title>
                    <style>
                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        th, td {
                            border: 1px solid black;
                            padding: 5px;
                            text-align: center;
                        }
                    </style>
                </head>
                <body>
                    <table>
                        <thead>
                            <tr>`;
            for (let i = 0; i < Math.min(itemsPerRow.value, fileList.value.length); i++) {
                htmlContent += `
                    <th>Description</th>
                    <th>Image</th>`;
            }
            htmlContent += `
                    </tr>
                </thead>
                <tbody>`;

            const imagePromises = [];
            let index = 0;
            for (let i = 0; i < fileList.value.length; i++) {
                const file = fileList.value[i];
                const description = metadataList.value[i].Description;

                const reader = new FileReader();
                const imagePromise = new Promise((resolve) => {
                    reader.onload = async (e) => {
                        let imageBase64 = e.target.result;
                        if (compressImage.value) {
                            imageBase64 = await compress(imageBase64, compressSizeRatio.value, compressQuality.value);
                        }
                        if (index % itemsPerRow.value === 0) {
                            htmlContent += '<tr>';
                        }
                        htmlContent += `
                            <td style="width: 100px; height: ${rowHeight.value}px; text-align: left; vertical-align: top; font-size: 10px">${description}</td>
                            <td><img src="${imageBase64}" alt="Image" height=${rowHeight.value}></td>`;
                        if (index % itemsPerRow.value === itemsPerRow.value - 1) {
                            htmlContent += '</tr>';
                        }
                        index++;
                        progress.value = Math.round((index / fileList.value.length) * 100);
                        resolve();
                    };
                    reader.readAsDataURL(file);
                });
                imagePromises.push(imagePromise);
            }

            Promise.all(imagePromises).then(() => {
                if (index % itemsPerRow.value !== 0) {
                    htmlContent += '</tr>';
                }
                htmlContent += `
                            </tbody>
                        </table>
                        <div class="footer">
                            Generated via 
                            <a href="https://github.com/Exception0x0194/NAI-Spellbook-Exporter" target="_blank">NAI-Spellbook-Exporter</a>
                        </div>
                    </body>
                    </html>`;

                const blob = new Blob([htmlContent], { type: 'text/html' });
                saveAs(blob, 'spellbook.html');
                isLoading.value = false;
            }).catch(() => {
                isLoading.value = false;
            });
        };

        return {
            fileInput,
            fileList,
            triggerFileInput,
            handleFiles,
            clearFiles,
            exportSheet,
            compressImage,
            compressRatio: compressSizeRatio,
            rowHeight,
            itemsPerRow,
            progress,
            isLoading
        };
    },
};
</script>


<style>
.form-container {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}
</style>