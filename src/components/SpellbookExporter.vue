<template>
    <div>
        <button @click="addChapter">添加章节</button>
        <button @click="exportSheet">导出到 HTML 表格</button>

        <div v-for="(chapter, index) in chapters" :key="index" class="chapter-box">
            章节 #{{ index + 1 }}：
            <input v-model="chapter.name" placeholder="输入章节名称" />
            <input type="file" :ref="'fileInput' + index" @change="handleFiles($event, index)" multiple
                accept="image/png" style="display: none;" />
            <button @click="triggerFileInput(index)">添加文件</button>
            <button @click="clearChapter(index)">清空文件</button>
            <button @click="removeChapter(index)">删除章节</button>
            <br>
            <span style="float: right;padding-right: 5px">文件数量：{{ chapter.fileList.length }}</span>
        </div>

        <div class="form-container">
            <div class="form-group">
                <p>
                    <input type="checkbox" v-model="compressImage"> 压缩图片
                    <span v-if="compressImage">&nbsp;← 将使用 JPG 压缩图片，缩小体积并清除水印信息</span>
                    <span v-else>&nbsp;← 将使用原本的 PNG 图片，保留原有的水印信息</span>
                </p>
            </div>

            <div class="form-group">
                每行图片数量：
                <input type="range" v-model="itemsPerRow" min="1" max="10" step="1">
                {{ itemsPerRow }}&nbsp;个
            </div>
            <div v-if="compressImage">
                JPG 压缩品质：
                <input type="range" v-model="compressRatio" min="0.5" max="1" step="0.05">
                &nbsp;{{ Math.round(compressRatio * 100) }}%
            </div>
        </div>


        <div v-if="isLoading">
            <p><progress max="100" :value="progress">{{ progress }}%</progress></p>
        </div>
    </div>
</template>


<script>
import { ref, getCurrentInstance } from 'vue';
import { getImageData, compress } from '../utils.js';
import { saveAs } from 'file-saver';

export default {
    setup() {
        const { proxy } = getCurrentInstance();

        const chapters = ref([{ title: "", comment: "", fileList: [], metadataList: [] }]);

        const itemsPerRow = ref(3);
        const compressImage = ref(false);
        const compressSizeRatio = ref(1);
        const compressQuality = ref(1);
        const rowHeight = ref(512);
        const progress = ref(0);
        const isLoading = ref(false);

        const addChapter = () => {
            chapters.value.push({ title: "", comment: "", fileList: [], metadataList: [] });
        };

        const clearChapter = (index) => {
            chapters.value[index].fileList = [];
            chapters.value[index].metadataList = [];
        };

        const removeChapter = (index) => {
            chapters.value.splice(index, 1);
        };

        const triggerFileInput = (index) => {
            const input = proxy.$refs['fileInput' + index];
            if (input && input[0]) {
                input[0].click();
            } else if (input) {
                input.click();
            }
        };

        const handleFiles = (event, index) => {
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
                                const metadata = await getImageData(arrayBuffer);
                                if (metadata) {
                                    chapters.value[index].fileList.push(file);
                                    chapters.value[index].metadataList.push(metadata);
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

        const exportSheet = async () => {
            if (chapters.value.length === 0) {
                return;
            }
            isLoading.value = true;
            progress.value = 0;

            let htmlContent = generateHTMLHeader(rowHeight.value);
            htmlContent += generateTOC(chapters.value);

            for (let i = 0; i < chapters.value.length; i++) {
                const chapterContent = await generateChapterContent(chapters.value[i], i, itemsPerRow.value, rowHeight.value, compressImage.value, compressSizeRatio.value, compressQuality.value, progress);
                htmlContent += chapterContent;
            }

            htmlContent += generateHTMLFooter();

            const blob = new Blob([htmlContent], { type: 'text/html' });
            saveAs(blob, 'spellbook.html');
            isLoading.value = false;
        };

        return {
            chapters,
            addChapter,
            triggerFileInput,
            handleFiles,
            clearChapter,
            removeChapter,
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

function generateHTMLHeader(rowHeight) {
    return `
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
                    <button type="button" class="fixed-button" style="top: 70px;" onclick="backToTOC()">回到目录</button>
                    <p>可以点击表格内容，对表格中的文本进行修改。<font color="red">如有修改，请注意及时保存（可以点击右上角按钮，另存一份修改后的 HTML 文件）。</font></p>
                    <p>如果没有压缩图片，可以将表格中的图片另存为<font color="red">具有生成信息的</font> PNG 图片。</p>
                    <p>
                        <label for="rowHeightRange">调整图片高度：</label>
                        <input type="range" id="rowHeightRange" min="128" max="1280" step="128" value="${rowHeight}" oninput="adjustRowHeight(this.value)">
                        <span id="rowHeightValue">&nbsp;${rowHeight}px</span>
                    </p>`;
}

function generateHTMLFooter() {
    return `
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
                        function backToTOC() {
                            window.scrollTo(0, document.querySelector('.toc').offsetTop);
                        }
                    <\/script>
                </body>
                </html>`;
}

async function generateChapterContent(chapter, index, itemsPerRow, rowHeight, compressImage, compressSizeRatio, compressQuality, progress) {
    if (chapter.fileList.length === 0) {
        return '';
    }
    const chapterTitle = chapter.name ? `#${index + 1}: ${chapter.name}` : `#${index + 1}`;
    let htmlContent = `<h2 id="chapter#${index}">${chapterTitle}</h2>`;
    htmlContent += `<table> <thead> <tr>`;
    for (let i = 0; i < Math.min(itemsPerRow, chapter.fileList.length); i++) {
        htmlContent += `
                    <th width="150px">Description</th>
                    <th width="512px">Image</th>`;
    }
    htmlContent += `</tr> </thead> <tbody>`;

    const totalFiles = chapter.fileList.length;
    const filePromises = [];
    let tableContent = '';
    let rowIndex = 0;

    for (let i = 0; i < totalFiles; i++) {
        const file = chapter.fileList[i];
        const description = chapter.metadataList[i].Description;

        const reader = new FileReader();
        const filePromise = new Promise((resolve) => {
            reader.onload = async (e) => {
                try {
                    let imageBase64 = e.target.result;
                    if (compressImage) {
                        imageBase64 = await compress(imageBase64, compressSizeRatio, compressQuality);
                    }
                    if (rowIndex % itemsPerRow === 0) {
                        tableContent += '<tr>';
                    }
                    tableContent += `
                                <td contenteditable="true" style="text-align: left; vertical-align: top; font-size: 10px">${description}</td>
                                <td><img src="${imageBase64}" alt="Image" height=${rowHeight}></td>`;
                    if (rowIndex % itemsPerRow === itemsPerRow - 1) {
                        tableContent += '</tr>';
                    }
                    rowIndex++;
                    progress.value = Math.round((rowIndex / totalFiles) * 100);
                    resolve();
                } catch (error) {
                    console.error('Error processing image:', error);
                    resolve();
                }
            };
            reader.readAsDataURL(file);
        });

        filePromises.push(filePromise);
    }

    await Promise.all(filePromises);

    if (rowIndex % itemsPerRow !== 0) {
        tableContent += '</tr>';
    }
    htmlContent += tableContent;
    htmlContent += `</tbody> </table>`;
    return htmlContent;
}

function generateTOC(chapters) {
    let tocContent = `<div class="toc"> <h2> 目录 </h2> <ul>`;
    chapters.forEach((chapter, index) => {
        const chapterTitle = chapter.name ? `#${index + 1}: ${chapter.name}` : `#${index + 1}`;
        tocContent += `<li><a href="#chapter#${index}">${chapterTitle}</a></li>`;
    });
    tocContent += `</ul> </div>`
    return tocContent;
}

</script>


<style>
.form-container {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.chapter-box {
    margin: 10px;
    border: 1px solid gray;
    padding: 5px;
    padding-bottom: 30px;
    border-radius: 4px;
}
</style>