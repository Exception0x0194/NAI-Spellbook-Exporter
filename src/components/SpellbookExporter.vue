<template>
    <div>
        <el-button @click="addChapter" :icon="DocumentAdd">添加章节</el-button>
        <el-button @click="exportSheet" :icon="Download">导出到 HTML 表格</el-button>

        <div v-for="(chapter, index) in chapters" :key="index" class="chapter-box">
            <div class="chapter-box-item">
                <span>章节 #{{ index + 1 }}：</span>
                <el-input v-model="chapter.name" style="width: 200px;" placeholder="输入章节名称" />
            </div>
            <div class="chapter-box-item">
                <el-button @click="triggerFileInput(index)" :icon="Plus">添加文件</el-button>
                <el-button @click="clearChapter(index)" :icon="Delete">清空文件</el-button>
                <el-button @click="removeChapter(index)" :icon="Close">删除章节</el-button>
            </div>
            <div style="float: right;">文件数量：{{ chapter.fileList.length }}</div>

            <input type="file" :ref="'fileInput' + index" @change="handleFiles($event, index)" multiple
                accept="image/png" style="display: none;" />
        </div>

        <div class="form-container">
            <div class="form-item">
                <p>
                    <el-checkbox-button v-model="compressImage" label="压缩图片" style="margin-right: 10px" />
                    <span v-if="compressImage">将使用 JPG 压缩图片，丢失水印信息</span>
                    <span v-else>将使用原本的 PNG 图片，保留水印信息</span>
                </p>
            </div>

            <div class="form-item">
                <span>每行图片数量：</span>
                <el-slider v-model="itemsPerRow" :min="1" :max="10" :step="1" :show-tooltip="false" />
                <span>{{ itemsPerRow }}&nbsp;个</span>
            </div>

            <div v-if="compressImage" class="form-item">
                <span>压缩品质：</span>
                <el-slider v-model="compressRatio" :min="0.5" :max="1" :step="0.05" :show-tooltip="false" />
                <span>{{ Math.round(compressRatio * 100) }}%</span>
                <!-- <span v-if="compressRatio == 1">&nbsp;← 将保留水印信息</span> -->
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
import { Plus, Delete, Close, Download, DocumentAdd } from '@element-plus/icons-vue';
import streamSaver from 'streamsaver';

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

        async function exportSheet() {
            if (chapters.value.length === 0) {
                return;
            }
            isLoading.value = true;
            progress.value = 0;

            const fileStream = streamSaver.createWriteStream('spellbook.html');
            const writer = fileStream.getWriter();

            // 写入HTML头部
            await writer.write(encodeText(generateHTMLHeader(rowHeight.value)));
            await writer.write(encodeText(generateTOC(chapters.value)));

            const totalFiles = chapters.value.reduce((acc, chapter) => acc + chapter.fileList.length, 0);
            let processedFiles = 0;

            for (let i = 0; i < chapters.value.length; i++) {
                const chapter = chapters.value[i];
                if (chapter.fileList.length === 0) {
                    continue;
                }
                const chapterTitle = chapter.name ? `#${i + 1}: ${chapter.name}` : `#${i + 1}`;
                await writer.write(encodeText(`<h2 id="chapter#${i}">${chapterTitle}</h2>`));
                await writer.write(encodeText(`<table><thead><tr>`));

                for (let j = 0; j < Math.min(itemsPerRow.value, chapter.fileList.length); j++) {
                    await writer.write(encodeText(`
                <th width="150px">Description</th>
                <th width="128px">Image</th>
            `));
                }

                await writer.write(encodeText(`</tr></thead><tbody>`));

                let rowIndex = 0;

                for (let j = 0; j < chapter.fileList.length; j++) {
                    const file = chapter.fileList[j];
                    const description = chapter.metadataList[j].Description;

                    const reader = new FileReader();
                    const filePromise = new Promise((resolve) => {
                        reader.onload = async (e) => {
                            try {
                                let imageBase64 = e.target.result;
                                if (compressImage.value) {
                                    imageBase64 = await compress(imageBase64, compressSizeRatio.value, compressQuality.value);
                                }
                                if (rowIndex % itemsPerRow.value === 0) {
                                    await writer.write(encodeText('<tr>'));
                                }
                                await writer.write(encodeText(`
                            <td contenteditable="true" style="text-align: left; vertical-align: top; font-size: 10px">${description.replace(/,([^ ])/g, ', $1')}</td>
                            <td><img data-src="${imageBase64}" alt="Image" height=${rowHeight.value} class="lazy"></td>
                        `));
                                if (rowIndex % itemsPerRow.value === itemsPerRow.value - 1) {
                                    await writer.write(encodeText('</tr>'));
                                }
                                rowIndex++;
                                processedFiles++;
                                progress.value = Math.round((processedFiles / totalFiles) * 100);
                                resolve();
                            } catch (error) {
                                console.error('Error processing image:', error);
                                resolve();
                            }
                        };
                        reader.readAsDataURL(file);
                    });

                    await filePromise;
                }

                if (rowIndex % itemsPerRow.value !== 0) {
                    await writer.write(encodeText('</tr>'));
                }
                await writer.write(encodeText(`</tbody></table>`));
            }

            // 写入HTML尾部和懒加载脚本
            await writer.write(encodeText(generateHTMLFooterWithLazyLoading()));
            await writer.close();

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
            isLoading, Plus, Delete, Close, Download, DocumentAdd
        };
    },
};

function encodeText(text) {
    const encoder = new TextEncoder();
    return encoder.encode(text);
}

async function createWritableBlobStream(filename) {
    const { writable, readable } = new TransformStream();
    const writer = writable.getWriter();
    const blobStream = new Response(readable).blob();

    saveAs(blobStream, filename);

    return writer;
}

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
                    <p>如果没有压缩图片，可以将表格中的图片另存为<font color="red">具有生成信息的</font>图片。</p>
                    <p>
                        <label for="rowHeightRange">调整图片高度：</label>
                        <input type="range" id="rowHeightRange" min="128" max="1280" step="128" value="${rowHeight}" oninput="adjustRowHeight(this.value)">
                        <span id="rowHeightValue">&nbsp;${rowHeight}px</span>
                    </p>`;
}

function generateHTMLFooterWithLazyLoading() {
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
                        document.addEventListener('DOMContentLoaded', function() {
                            let lazyImages = [].slice.call(document.querySelectorAll('img.lazy'));

                            if ('IntersectionObserver' in window) {
                                let lazyImageObserver = new IntersectionObserver(function(entries, observer) {
                                    entries.forEach(function(entry) {
                                        if (entry.isIntersecting) {
                                            let lazyImage = entry.target;
                                            lazyImage.src = lazyImage.dataset.src;
                                            lazyImage.classList.remove('lazy');
                                            lazyImage.classList.add('lazy-loaded');
                                            lazyImageObserver.unobserve(lazyImage);
                                        }
                                    });
                                });

                                lazyImages.forEach(function(lazyImage) {
                                    lazyImageObserver.observe(lazyImage);
                                });
                            } else {
                                // Fallback for older browsers
                                let lazyLoad = function() {
                                    lazyImages.forEach(function(lazyImage) {
                                        if (lazyImage.getBoundingClientRect().top < window.innerHeight) {
                                            lazyImage.src = lazyImage.dataset.src;
                                            lazyImage.classList.remove('lazy');
                                            lazyImage.classList.add('lazy-loaded');
                                        }
                                    });
                                };

                                window.addEventListener('scroll', lazyLoad);
                                window.addEventListener('resize', lazyLoad);
                                lazyLoad();
                            }
                        });
                    <\/script>
                </body>
                </html>`;
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

.form-container .form-item {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    width: 100%;
}

.form-container .form-item .el-slider {
    width: 150px;
    margin-left: 10px;
    margin-right: 20px;
}

.chapter-box {
    margin: 10px;
    border: 1px solid gray;
    padding: 5px;
    padding-bottom: 30px;
    border-radius: 8px;
    width: 100%;
}

.chapter-box .chapter-box-item {
    margin-bottom: 5px;
}
</style>