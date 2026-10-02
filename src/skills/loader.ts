import fs from 'fs/promises';
import path from 'path';
import { Skill, skillRegistry } from './registry.js';

export class SkillLoader {
  private static skillsDir = path.join(process.cwd(), '.agents', 'skills');

  static async loadAll() {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = path.join(this.skillsDir, entry.name);
          const skillFile = path.join(skillPath, 'SKILL.md');
          
          try {
            const content = await fs.readFile(skillFile, 'utf8');
            const skill = this.parseSkillFile(entry.name, content);
            skillRegistry.registerSkill(skill);
          } catch (e) {
            // Skill folder without SKILL.md is ignored
          }
        }
      }
    } catch (e) {
      // skills directory might not exist yet
    }
  }

  private static parseSkillFile(folderName: string, content: string): Skill {
    const lines = content.split('\n');
    const name = lines[0].replace('# ', '').trim();
    
    // Very simple parsing: assume first line is name, then description, then instructions
    const description = lines.find(l => l.trim() && !l.startsWith('#')) || 'No description provided.';
    
    return {
      name,
      description: description.trim(),
      instructions: content
    };
  }
}
