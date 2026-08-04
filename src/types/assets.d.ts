// Ambient declarations for foliate-js (browser-only ESM, ships no types).
declare module "foliate-js/view.js" {
  export class View extends HTMLElement {
    book: any;
    renderer?: { setStyles: (css: string) => void; goTo: (t: any) => Promise<void> };
    lastLocation: string | null;
    open(book: any): Promise<void>;
    init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    goTo(target: any): Promise<void>;
    prev(): Promise<void>;
    next(): Promise<void>;
    close(): void;
    getCFI(index: number, range?: any): string;
  }
  export function makeBook(file: File | Blob | string): Promise<any>;
  export class ResponseError extends Error {}
  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}
}

// Turbopack/Webpack `?url` asset imports.
declare module "*?url" {
  const src: string;
  export default src;
}

// pdf.js browser build (ships its own types under pdfjs-dist/types, but the
// deep .mjs import isn't typed — treat as any for the dynamic browser import).
declare module "pdfjs-dist/build/pdf.mjs" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(params: any): any;
}
