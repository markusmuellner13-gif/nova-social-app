// Nova's adaptive extraction engine — public surface.
//
// See types.ts for the honest description of what "learning" means here, and
// docs/NOVA_EXTRACTOR.md for the whole design.

export type {
  ExtractedRecord, RecordKind, FieldName, LearnedSkill, Payload, PayloadSource, ReadReport,
} from './types';
export { readPage, fetchAndRead } from './engine';
export { harvestPayloads, harvestMeta } from './harvest';
export { readBuiltIns, readSchemaOrg, readMicrodata, readMetaTags } from './dialects';
export { learnSkill, applySkill } from './learn';
export { inferFields, applyFields } from './infer';
export { loadSkills, rememberSkill, reward, skillReport, hostOf, resetSkillMemory } from './skillStore';
export { isUsableRecord, recordRichness, batchQuality } from './validate';
