// Read-only extraction: no tab URLs, chat data or credentials.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';
const directory=join(homedir(),'Library/Application Support/PIURA Modes/Reports');
const since=process.argv[2]||'2026-09-02T18:20:00Z';
const reports=readdirSync(directory).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(readFileSync(join(directory,f),'utf8'))).filter(r=>r.time>=since).sort((a,b)=>a.time.localeCompare(b.time));
console.log(JSON.stringify(reports.map(r=>({time:r.time,mode:r.mode,preview:r.preview,seconds:r.durationSeconds,ok:r.ok,message:r.message,timings:r.timings,checks:r.windows.filter(w=>w.splitView||w.musicPlaying!==undefined||w.officeLighting||w.officeStart||w.centerForeground||w.learningERPMinimized||w.erpVisibleAtFinish||w.reusedTelegramPair||w.benchmarkHostPreserved||w.wallpaper).map(w=>w.wallpaper?{display:w.display,wallpaper:w.wallpaper.split('/').at(-1)}:w)})),null,2));
