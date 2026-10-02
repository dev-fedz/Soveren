export interface Skill {
  name: string;
  description: string;
  instructions: string;
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  registerSkill(skill: Skill) {
    this.skills.set(skill.name.toLowerCase(), skill);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name.toLowerCase());
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  findRelevantSkills(query: string): Skill[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllSkills().filter(s => 
      s.name.toLowerCase().includes(lowerQuery) || 
      s.description.toLowerCase().includes(lowerQuery)
    );
  }
}

export const skillRegistry = new SkillRegistry();
