export type Page = 'chat' | 'skills' | 'projects' | 'agents';

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  badge: string;
  icon: 'general' | 'search' | 'code' | 'orchestrator' | 'custom';
  builtIn: boolean;
}

export const AGENTS: AgentDefinition[] = [
  {
    id: 'general',
    name: 'المساعد العام',
    description: 'محادثة عامة باستخدام Ollama',
    badge: 'أساسي',
    icon: 'general',
    builtIn: true,
  },
  {
    id: 'search',
    name: 'وكيل البحث',
    description: 'البحث والتحليل باستخدام أدوات موصولة',
    badge: 'اختياري',
    icon: 'search',
    builtIn: true,
  },
  {
    id: 'coding',
    name: 'وكيل البرمجة',
    description: 'توليد الأكواد ومراجعتها',
    badge: 'اختياري',
    icon: 'code',
    builtIn: true,
  },
  {
    id: 'orchestrator',
    name: 'الوكيل المنسّق',
    description: 'تنسيق العمل بين عدة وكلاء',
    badge: 'اختياري',
    icon: 'orchestrator',
    builtIn: true,
  },
];
export type Theme = 'light' | 'dark';
export type ModelId = string;

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: 'canvas' | 'creator' | 'frontend' | 'style' | 'template';
  instructions?: string;
  isBuiltIn?: boolean;
}

export interface ChatItem {
  id: string;
  title: string;
  active?: boolean;
}

export interface AiModel {
  id: ModelId;
  name: string;
  description: string;
  providerKey?: string;
  configured?: boolean;
}

/** Static interface labels taken from the reference screens. No business data. */
export const CHAT_ITEMS: ChatItem[] = [
  { id: '1', title: 'Untitled', active: true },
  { id: '2', title: 'يا من' },
  { id: '3', title: 'Help me create a skill' },
  { id: '4', title: '# MASTER PROMPT — DT...' },
  { id: '5', title: 'لل انتريكول كل ما والا' },
  { id: '6', title: '# MUSTAFA AI MASTER PR...' },
  { id: '7', title: 'بمرفات انت ب شكال' },
];

export const INITIAL_SKILLS: Skill[] = [
  {
    id: 'canvas-design',
    name: 'Canvas Design',
    description:
      'Create beautiful visual art in .png and .pdf documents using design philosophy. You should use this skill when the user asks to create a poster, piece of art, design, or other static piece. Creates original visual designs, never copying existin...',
    enabled: true,
    icon: 'canvas',
  },
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description:
      'Create new skills, modify and improve existing skills, and measure skill performance. Triggers: create a “skill”, “build a skill”, “new skill”, “edit skill”, “modify skill”, “optimize skill”, “skill eval”, “test skill”, “benchmark skill”. Do NOT trigger o...',
    enabled: true,
    icon: 'creator',
  },
  {
    id: 'frontend-design',
    name: 'Frontend Design',
    description:
      'Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages,...',
    enabled: false,
    icon: 'frontend',
  },
  {
    id: 'style-skill-builder',
    name: 'Style Skill Builder',
    description:
      'Create a REUSABLE style skill from an uploaded design sample (HTML/PXTX/PDF) so future decks and documents match that brand’s look without re-uploading the file. Use when the user uploads a sample and asks to save this styl...',
    enabled: true,
    icon: 'style',
  },
  {
    id: 'template-filling-skill-builder',
    name: 'Template Filling Skill Builder',
    description:
      'Create a reusable skill from an uploaded template (CSV, letter, report, invoice, form, memo) that fills that exact template with new information while preserving its layout and styling. Use when the user uploads a document and asks to...',
    enabled: true,
    icon: 'template',
  },
];

export const AI_MODELS: AiModel[] = [
  {
    id: 'qwen',
    name: 'ALLAM Qwen Adapted',
    description: 'For Advanced tasks, reasoning and image understanding',
  },
  {
    id: 'native',
    name: 'ALLAM Native',
    description: 'Locally aligned and culturally aware',
  },
];

export const PROJECT_SUGGESTIONS = [
  { label: 'Trip Planning', emoji: '✈️' },
  { label: 'Research Project', emoji: '💡' },
  { label: 'Marketing Campaign', emoji: '🎯' },
  { label: 'Content Writing', emoji: '📝' },
];
