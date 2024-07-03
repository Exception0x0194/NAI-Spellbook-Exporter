<template>
    <div>
        <div>
            <span>法典标题：</span>
            <el-input v-model="title" style="width: 200px; margin-bottom: 5px" placeholder="输入法典标题" />
        </div>

        <div>
            <el-button @click="addChapter" :icon="DocumentAdd">添加章节</el-button>
            <el-button @click="addFolder" :icon="FolderAdd">由二级目录批量生成章节</el-button>
            <input type="file" id="add-chapter-input" multiple webkitdirectory style="display: none;"
                @change="handleFolders" />
        </div>

        <div v-for="(chapter, index) in chapters" :key="index" class="chapter-box">
            <div class="chapter-box-item">
                <span>章节 #{{ index + 1 }}：</span>
                <el-input v-model="chapter.name" style="width: 200px;" placeholder="输入章节标题" />
            </div>
            <div class="chapter-box-item">
                <el-button @click="triggerFileInput(index)" :icon="Plus">添加文件</el-button>
                <el-button @click="clearChapter(index)" :icon="Delete">清空文件</el-button>
                <el-button @click="removeChapter(index)" :icon="Close">删除章节</el-button>
            </div>
            <div style="float: right;">文件数量：{{ chapter.fileList.length }}</div>

            <input type="file" :ref="'fileInput' + index" @change="handleFiles($event, index)" multiple
                accept="image/png, image/gif, image/webp" style="display: none;" />
        </div>

        <div>
            <el-button @click="exportText" :icon="Document">导出 Prompt 纯文本</el-button>
            <el-button @click="exportSheet" :icon="Download">导出到 HTML 表格</el-button>
        </div>

        <div class="form-container">
            <div class="form-item">
                <p>
                    <el-checkbox-button v-model="compressImage" label="压缩图片" style="margin-right: 10px" />
                    <span v-if="compressImage">将压缩图片（较慢，建议使用<a
                            href="https://github.com/Exception0x0194/webp-compressor">本地压图软件</a>后再导入）</span>
                    <span v-else>将使用导入的图片</span>
                </p>
            </div>

            <div class="form-item">
                <span>每行图片数量：</span>
                <el-slider v-model="itemsPerRow" :min="1" :max="10" :step="1" :show-tooltip="false" />
                <span>{{ itemsPerRow }}&nbsp;个</span>
            </div>

            <div v-if="compressImage" class="form-item">
                <span>压缩品质：</span>
                <el-slider v-model="compressQuality" :min="0" :max="100" :step="5" :show-tooltip="false" />
                <span>{{ compressQuality }}%</span>
            </div>
        </div>


        <div v-if="loadInfo.isLoading">
            <progress max="100" :value="computeProgress">{{ computeProgress }}%</progress>
        </div>

    </div>
</template>


<script>
import { ref, getCurrentInstance, computed } from 'vue';
import { getImageData, compress } from '../utils.js';
import { ElMessage } from 'element-plus';
import { Plus, Delete, Close, Download, DocumentAdd, FolderAdd, Document } from '@element-plus/icons-vue';
import streamSaver from 'streamsaver';
import { preProcessFile } from 'typescript';

export default {
    setup() {
        const { proxy } = getCurrentInstance();

        const title = ref("");
        const chapters = ref([{ title: "", comment: "", fileList: [], metadataList: [] }]);

        const itemsPerRow = ref(3);
        const compressImage = ref(false);
        const compressQuality = ref(90);
        const rowHeight = ref(512);

        const loadInfo = ref({ isLoading: false, current: 0, max: 0 });

        const addFolder = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.webkitdirectory = true;
            input.multiple = true;
            input.onchange = handleFolders;
            input.click();
        };

        const addChapter = () => {
            chapters.value.push({ name: "", comment: "", fileList: [], metadataList: [] });
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

        const handleFiles = async (event, index) => {
            const input = event.target;
            if (input.files) {
                loadInfo.value.isLoading = true;
                loadInfo.value.current = 0;

                const totalFiles = input.files.length;
                loadInfo.value.max = totalFiles;

                for (let i = 0; i < totalFiles; i++) {
                    const file = input.files[i];
                    await processFile(file, chapters.value[index]);
                }

                loadInfo.value.isLoading = false;
                ElMessage({ message: `处理了 ${totalFiles} 份文件`, type: 'success' });
            }
        };

        const handleFolders = async (event) => {
            const fileMap = event.target.files;
            const totalFiles = fileMap['length'];
            if (totalFiles === 0) return;

            loadInfo.value.isLoading = true;
            loadInfo.value.max = totalFiles;

            const folderStructure = {};
            const rootFiles = [];

            // 组织文件和文件夹
            for (let idx = 0; idx < totalFiles; idx++) {
                const file = fileMap[idx];
                const pathParts = file.webkitRelativePath.split('/');
                if (pathParts.length === 2) {  // 直接位于一级目录下的文件
                    rootFiles.push(file);
                } else if (pathParts.length > 2) {
                    const chapterName = pathParts[1];
                    if (!folderStructure[chapterName]) {
                        folderStructure[chapterName] = [];
                    }
                    folderStructure[chapterName].push(file);
                }
            }

            // 设置标题
            title.value = fileMap[0].webkitRelativePath.split('/')[0];

            const filePromises = [];

            // 处理章节文件夹
            for (const chapterName in folderStructure) {
                const newChapter = { name: chapterName, comment: "", fileList: [], metadataList: [] };
                folderStructure[chapterName].forEach(file => {
                    const filePromise = processFile(file, newChapter);
                    filePromises.push(filePromise);
                });
                chapters.value.push(newChapter);
            }

            // 处理根目录文件
            const rootChapter = { name: "其他文件", comment: "", fileList: [], metadataList: [] };
            rootFiles.forEach(file => {
                const filePromise = processFile(file, rootChapter);
                filePromises.push(filePromise);
            });
            if (rootFiles.length > 0) {
                chapters.value.push(rootChapter);
            }

            // 等待所有文件处理完成
            await Promise.all(filePromises);
            loadInfo.value.isLoading = false;
            ElMessage({ message: `处理了 ${totalFiles} 份文件`, type: 'success' });
        };

        const processFile = (file, chapter) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const arrayBuffer = new Uint8Array(e.target.result);
                        const metadata = await getImageData(arrayBuffer, file.type);
                        if (metadata) {
                            chapter.fileList.push(file);
                            chapter.metadataList.push(metadata);
                        } else {
                            ElMessage({ message: `未找到生成信息：${file.name}`, type: 'error' });
                        }
                    } catch (error) {
                        ElMessage({ message: `读取信息时出错：${file.name}，错误信息：${error}`, type: 'error' });
                    } finally {
                        loadInfo.value.current++;
                        resolve();
                    }
                };
                reader.readAsArrayBuffer(file);
            });
        };

        const computeProgress = computed(() => {
            if (loadInfo.value.max > 0) {
                const percentage = Math.round((loadInfo.value.current / loadInfo.value.max) * 100);
                return percentage;
            }
            return 0;
        });

        const exportText = () => {
            let content = '';
            chapters.value.forEach(chapter => {
                if (chapter.metadataList.length > 0) {
                    chapter.metadataList.forEach(metadata => {
                        content += metadata.Description + '\n';
                    })
                }
            });
            content = content.trim();

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'prompts.txt';
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        async function exportSheet() {
            if (chapters.value.length === 0) {
                return;
            }
            loadInfo.value.isLoading = true;
            loadInfo.value.current = 0;

            const fileStream = streamSaver.createWriteStream(`${title.value.length == 0 ? 'spellbook' : title.value}.html`);
            const writer = fileStream.getWriter();

            // 写入HTML头部
            await writer.write(encodeText(generateHTMLHeader(title.value, rowHeight.value)));
            await writer.write(encodeText(generateTOC(chapters.value)));

            const totalFiles = chapters.value.reduce((acc, chapter) => acc + chapter.fileList.length, 0);

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
                                let imageBytes = e.target.result;
                                if (compressImage.value) {
                                    const compressedBytes = await compress(imageBytes, compressQuality.value);
                                    if (compressedBytes != null) imageBytes = compressedBytes;
                                }
                                if (rowIndex % itemsPerRow.value === 0) {
                                    await writer.write(encodeText('<tr>'));
                                }
                                await writer.write(encodeText(`
                                    <td contenteditable="true" style="text-align: left; vertical-align: top; font-size: 10px">${description.replace(/,([^ ])/g, ', $1')}</td>
                                    <td><img data-src="${imageBytes}" alt="Image" height=${rowHeight.value} class="lazy"></td>
                                `));
                                if (rowIndex % itemsPerRow.value === itemsPerRow.value - 1) {
                                    await writer.write(encodeText('</tr>'));
                                }
                                rowIndex++;
                                loadInfo.value.current++;
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

            loadInfo.value.isLoading = false;
        };


        return {
            title,
            chapters,
            compressQuality,
            rowHeight,
            itemsPerRow,
            loadInfo,

            addChapter,
            triggerFileInput,
            handleFiles,
            clearChapter,
            removeChapter,
            exportSheet,
            exportText,
            compressImage,
            addFolder,
            handleFolders,
            computeProgress,

            Plus, Delete, Close, Download, DocumentAdd, FolderAdd, Document
        };
    },
};

function encodeText(text) {
    const encoder = new TextEncoder();
    return encoder.encode(text);
}

function generateHTMLHeader(title = '', rowHeight = 0) {
    return `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${title.length == 0 ? "HTML Spellbook" : title}</title>
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
                    <h1>${title.length == 0 ? "HTML 法典" : title}</h1>
                    <button type="button" class="fixed-button" onclick="saveStaticHTML()">另存一份</button>
                    <button type="button" class="fixed-button" style="top: 70px;" onclick="backToTOC()">回到目录</button>
                    <p>可以点击表格内容，对表格中的文本进行修改。<font color="red">如有修改，请注意及时保存（可以点击右上角按钮，另存一份修改后的 HTML 文件）。</font></p>
                    <p>可以将表格中的图片另存为<font color="red">具有生成信息的</font> PNG/WEBP 图片。</p>
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