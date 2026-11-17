// Loads pdf.js with its worker (browser only). Imported on demand by extract.js.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export default pdfjs;
