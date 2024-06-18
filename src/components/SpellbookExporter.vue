<template>
    <div>
        <input type="file" @change="handleFiles" multiple accept="image/png" ref="fileInput" style="display: none;" />
        <button @click="triggerFileInput">添加文件</button>
        <button @click="clearFiles">清空文件</button>
        <button @click="exportSheet">导出到 HTML 表格</button>

        <p>待处理文件数量：{{ fileList.length }}</p>

        <div class="form-container">
            <div class="form-group">
                <p>
                    <input type="checkbox" v-model="compressImage"> 压缩图片
                    <span v-if="compressImage">&nbsp;← 将使用 JPG 压缩图片，缩小体积并清除水印信息</span>
                    <span v-else>&nbsp;← 将使用原本的 PNG 图片，保留原有的水印信息</span>
                </p>
            </div>

            <div class="form-group">
                <p>
                    每行图片数量：
                    <input type="range" v-model="itemsPerRow" min="1" max="10" step="1">
                    {{ itemsPerRow }}&nbsp;个
                </p>
            </div>
            <div v-if="compressImage">
                <p>
                    JPG 压缩品质：<input type="range" v-model="compressRatio" min="0.5" max="1" step="0.05">&nbsp;{{
                        Math.round(compressRatio * 100) }}%
                </p>
            </div>
        </div>
        <div v-if="isLoading">
            <p><progress max="100" :value="progress">{{ progress }}%</progress></p>
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
        const compressImage = ref(false);
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
                isLoading.value = true;
                progress.value = 0;

                let completed = 0;
                const totalFiles = input.files.length;

                const filePromises = [];
                for (let i = 0; i < totalFiles; i++) {
                    const file = input.files[i];
                    const reader = new FileReader();

                    const filePromise = new Promise((resolve) => {
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
                            } finally {
                                completed++;
                                progress.value = Math.round(100 * completed / totalFiles);
                                resolve();
                            }
                        };
                        reader.readAsArrayBuffer(file);
                    });

                    filePromises.push(filePromise);
                }

                Promise.all(filePromises).then(() => {
                    isLoading.value = false;
                    progress.value = 0;
                });
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
                            border-collapse: collapse;
                        }
                        th, td {
                            border: 1px solid gray;
                            padding: 5px;
                        }
                        .fixed-button {
                            position: fixed;
                            top: 10px;
                            right: 10px;
                            z-index: 1000;
                            width: 100px;
                            height: 50px; 
                            font-size: 16px;
                        }
                    </style>
                </head>
                <body>
                    <h1>HTML 法典</h1>
                    <button type="button" class="fixed-button" onclick="saveStaticHTML()">另存一份</button>
                    <p>可以点击表格内容，对表格中的文本进行修改。<font color="red">如有修改，请注意及时保存（可以点击右上角按钮，另存一份修改后的 HTML 文件）。</font></p>
                    <p>
                        <label for="rowHeightRange">调整图片高度：</label>
                        <input type="range" id="rowHeightRange" min="128" max="1280" step="128" value="${rowHeight.value}" oninput="adjustRowHeight(this.value)">
                        <span id="rowHeightValue">&nbsp;${rowHeight.value}px</span>
                    </p>
                    <table>
                        <thead>
                            <tr>`;
            for (let i = 0; i < Math.min(itemsPerRow.value, fileList.value.length); i++) {
                htmlContent += `
                    <th width="150px">Description</th>
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
                            <td contenteditable="true" style="text-align: left; vertical-align: top; font-size: 10px">${description}</td>
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
                        <script>
                            function adjustRowHeight(value) {
                                document.querySelectorAll('img').forEach(img => {
                                    img.style.height = value + 'px';
                                });
                                document.getElementById('rowHeightValue').innerText = value + 'px';
                            }
                            function saveStaticHTML() {
                                const content = document.documentElement.outerHTML;
                                const blob = new Blob([content], { type: 'text/html' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'spellbook.html';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            }
                        <\/script>
                    </body>
                    </html>`;

                const blob = new Blob([htmlContent], { type: 'text/html' });
                saveAs(blob, 'spellbook.html');
            }).finally(() => {
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