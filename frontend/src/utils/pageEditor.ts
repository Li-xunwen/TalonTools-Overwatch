/**
 * pageEditor.ts — 段落拆分/合并 + localStorage 持久化工具
 */

export interface PageSection {
    id: string;
    heading: string;
    content: string;
    history: string[];   // 撤销快照栈（最多 50 条）
}

const MAX_HISTORY = 50;

function uid(): string {
    return Math.random().toString(36).slice(2, 10);
}

// =================================================================
// Markdown 段落拆分 / 合并
// =================================================================

export function parseSections(markdown: string): PageSection[] {
    const trimmed = markdown.trim();
    if (!trimmed) return [];
    const blocks = trimmed.split(/(?=^## )/m);
    const sections: PageSection[] = [];
    for (const block of blocks) {
        const lines = block.split('\n');
        const firstLine = lines[0];
        if (/^##\s/.test(firstLine)) {
            sections.push({
                id: uid(),
                heading: firstLine.replace(/^##\s+/, ''),
                content: lines.slice(1).join('\n').trim(),
                history: [],
            });
        } else {
            sections.push({ id: uid(), heading: '', content: block.trim(), history: [] });
        }
    }
    return sections;
}

export function mergeSections(sections: PageSection[]): string {
    return sections
        .map(s => s.heading ? `## ${s.heading}\n${s.content}` : s.content)
        .join('\n\n');
}

// =================================================================
// 段落操作
// =================================================================

export function insertSection(sections: PageSection[], index: number): PageSection[] {
    const newSection: PageSection = {
        id: uid(), heading: '新标题', content: '正文', history: [],
    };
    const copy = [...sections];
    copy.splice(index, 0, newSection);
    return copy;
}

export function removeSection(sections: PageSection[], index: number): PageSection[] {
    return sections.filter((_, i) => i !== index);
}

export function undoSection(section: PageSection): PageSection | null {
    if (section.history.length === 0) return null;
    return {
        ...section,
        content: section.history[section.history.length - 1],
        history: section.history.slice(0, -1),
    };
}

// =================================================================
// localStorage 持久化
// =================================================================

export interface LocalEditCache {
    pageId: number;
    sections: PageSection[];
    savedAt: number;
    userId: number;
    originalUpdatedAt: string;
}

export function loadEditCache(pageId: number, userId: number): LocalEditCache | null {
    try {
        const raw = localStorage.getItem(`talon_page_edit_${pageId}_${userId}`);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export function saveEditCache(cache: LocalEditCache): void {
    try {
        localStorage.setItem(
            `talon_page_edit_${cache.pageId}_${cache.userId}`,
            JSON.stringify({ ...cache, savedAt: Date.now() })
        );
    } catch (e) { console.warn('localStorage 写入失败:', e); }
}

export function clearEditCache(pageId: number, userId: number): void {
    localStorage.removeItem(`talon_page_edit_${pageId}_${userId}`);
}

export function isCacheStale(cache: LocalEditCache, apiUpdatedAt: string): boolean {
    return new Date(apiUpdatedAt).getTime() > cache.savedAt;
}
