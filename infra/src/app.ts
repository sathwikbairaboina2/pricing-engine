import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { applyNagAcknowledgements } from './nag-acknowledgements.js';
import { PricingStack } from './pricing-stack.js';

export function buildApp(opts: { nag?: boolean; outdir?: string } = {}): { app: App; stack: PricingStack } {
  const app = new App(opts.outdir ? { outdir: opts.outdir } : {});
  const stack = new PricingStack(app, 'PricingEngine');
  if (opts.nag ?? true) {
    Validations.of(app).addPlugins(new AwsSolutionsChecks(app));
    applyNagAcknowledgements(stack);
  }
  return { app, stack };
}
