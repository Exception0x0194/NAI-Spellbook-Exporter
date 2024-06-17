<template>
    <div>
        <input type="file" @change="handleFiles" multiple accept="image/png" ref="fileInput" style="display: none;" />
        <button @click="triggerFileInput">添加文件</button>
        <button @click="clearFiles">清空文件</button>
        <button @click="exportXlsx">导出到 HTML 表格</button>

        <p>待处理文件数量：{{ files.length }}</p>
    </div>
</template>

<script>
import { ref } from 'vue';
import { getStealthExif } from '../utils.js';
import { saveAs } from 'file-saver';

export default {
    setup() {
        const fileInput = ref(null);

        const fileList = ref([]);
        const metadataList = ref([]);
        const itemsPerRow = ref(3);

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
                    console.log(metadataList.value);
                }
            }
        };

        const clearFiles = () => {
            fileList.value = [];
            metadataList.value = [];
        };

        const exportSheet = () => {
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
                    reader.onload = (e) => {
                        const imageBase64 = e.target.result;
                        if (index % itemsPerRow.value === 0) {
                            htmlContent += '<tr>';
                        }
                        htmlContent += `
                            <td>${description}</td>
                            <td><img src="${imageBase64}" alt="Image"></td>`;
                        if (index % itemsPerRow.value === itemsPerRow.value - 1) {
                            htmlContent += '</tr>';
                        }
                        index++;
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
            });
        };



        return {
            fileInput,
            files: fileList,
            triggerFileInput,
            handleFiles,
            clearFiles,
            exportXlsx: exportSheet,
        };
    },
};
</script>

<style scoped>
/* Add any necessary styles here */
</style>