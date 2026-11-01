import YAML from 'yaml';
import raw from './resume.yaml?raw';
import files from './resume-files.json';

const resume = YAML.parse(raw);
export default resume;
export const resumeFiles = files as { pdf: string; docx: string };
