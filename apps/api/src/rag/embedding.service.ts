import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ExtractorOutput = { data: Float32Array; dims: number[] };

type FeatureExtractionPipeline = (
  input: string | string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<ExtractorOutput>;

const QUERY_INSTRUCTION =
  'Represent this sentence for searching relevant passages: ';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  readonly model: string;
  readonly dim = 384;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(private readonly config: ConfigService) {
    this.model =
      this.config.get<string>('EMBEDDING_MODEL') ?? 'Xenova/bge-small-en-v1.5';
  }

  private async extractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        const { pipeline, env } = await import('@huggingface/transformers');
        env.allowLocalModels = false;
        this.logger.log(`Loading embedding model ${this.model}…`);
        const pipe = await pipeline('feature-extraction', this.model);
        this.logger.log('Embedding model ready');
        return pipe as unknown as FeatureExtractionPipeline;
      })();
    }
    return this.extractorPromise;
  }

  async embedPassage(text: string): Promise<number[]> {
    const [vector] = await this.embedPassages([text]);
    return vector;
  }

  async embedPassages(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.extractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const dim = output.dims[output.dims.length - 1];
    const flat = Array.from(output.data);
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      vectors.push(flat.slice(i * dim, (i + 1) * dim));
    }
    return vectors;
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embedPassage(QUERY_INSTRUCTION + text);
  }
}
