import { config } from '../config.js';

export function chunkText(text, { chunkSize, chunkOverlap, metadata = {} } = {}) {
  const size = chunkSize ?? config.rag.chunkSize;
  const overlap = chunkOverlap ?? config.rag.chunkOverlap;

  if (!text || text.length <= size) {
    return [{ content: text, ...metadata, chunkIndex: 0 }];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = start + size;

    if (end < text.length) {
      const slice = text.slice(start, end);
      const breakPoints = ['\n\n', '\n', ' ', ''];
      for (const bp of breakPoints) {
        const lastBreak = slice.lastIndexOf(bp);
        if (lastBreak > size * 0.5) {
          end = start + lastBreak + (bp.length || 1);
          break;
        }
      }
    }

    chunks.push({
      content: text.slice(start, end).trim(),
      ...metadata,
      chunkIndex: index,
    });

    start = end - overlap;
    index += 1;
  }

  return chunks.filter((c) => c.content.length > 0);
}

export function chunkFiles(files) {
  const allChunks = [];

  for (const file of files) {
    const header = `File: ${file.path}\nRepo: ${file.repo}\n\n`;
    const chunks = chunkText(file.content, {
      metadata: {
        repo: file.repo,
        path: file.path,
        branch: file.branch,
      },
    });

    for (const chunk of chunks) {
      allChunks.push({
        ...chunk,
        content: header + chunk.content,
      });
    }
  }

  return allChunks;
}
