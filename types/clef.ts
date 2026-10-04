export type ClefQuestionType = 'noul' | 'choice' | 'score';

export interface ClefNoulQuestion {
    type: 'noul';
    instructions: string;
    criteria?: {
        true?: string;
        false?: string;
    };
}

export interface ClefChoiceQuestion {
    type: 'choice';
    instructions: string;
    criteria: Record<string, string>;
}

export interface ClefScoreQuestion {
    type: 'score';
    instructions: string;
    criteria: string[];
}

export type ClefQuestion = ClefNoulQuestion | ClefChoiceQuestion | ClefScoreQuestion;

export interface ClefNoulAnswer {
    type: 'noul';
    noul: number;
}

export interface ClefChoiceAnswer {
    type: 'choice';
    choice: string;
    confidence?: number;
}

export interface ClefScoreAnswer {
    type: 'score';
    score: number;
}

export type ClefAnswer = ClefNoulAnswer | ClefChoiceAnswer | ClefScoreAnswer;

export interface ClefResponse {
    answers: Record<string, ClefAnswer>;
    model?: string;
    usage?: {
        input_tokens?: number;
        output_tokens?: number;
    };
}
