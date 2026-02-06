/**
 * Input for a content generation request.
 * Maps to primary-context.yaml → generation_workflow.input
 */
export interface GenerationInput {
  /** Absolute path to the project's RAG folder */
  projectPath: string;
  /** Absolute path to the selected prompt file */
  promptFilePath: string;
  /** Optional generation options */
  options?: GenerationOptions;
}

export interface GenerationOptions {
  /** Max procedure chunks to retrieve per SOP (default: 3) */
  topKProcedures?: number;
  /** Max context chunks to retrieve (default: 2) */
  topKContext?: number;
}
