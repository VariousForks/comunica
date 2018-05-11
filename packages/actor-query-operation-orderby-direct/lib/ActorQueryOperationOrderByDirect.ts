import {
  ActorQueryOperation, ActorQueryOperationTypedMediated,
  Bindings, IActorQueryOperationOutputBindings,
  IActorQueryOperationTypedMediatedArgs} from "@comunica/bus-query-operation";
import {IActorTest} from "@comunica/core";
import { Term } from "rdf-js";
import {termToString} from "rdf-string";
import {Algebra} from "sparqlalgebrajs";
import { AsyncEvaluator } from 'sparqlee';
import {SortIterator} from "./SortIterator";

/**
 * A comunica OrderBy Direct Query Operation Actor.
 */
export class ActorQueryOperationOrderByDirect extends ActorQueryOperationTypedMediated<Algebra.OrderBy> {

  private window: number;

  constructor(args: IActorQueryOperationOrderByDirectArgs) {
    super(args, 'orderby');
    this.window = args.window || Infinity;
  }

  public async testOperation(pattern: Algebra.OrderBy, context?: {[id: string]: any}): Promise<IActorTest> {
    // will throw error for unsupported operators
    for (let expr of pattern.expressions) {
      // remove descending operator
      if (expr.expressionType === Algebra.expressionTypes.OPERATOR) {
        const op = <Algebra.OperatorExpression> expr;
        if (op.operator === 'desc') {
          expr = op.args[0];
        }
      }
      const _ = new AsyncEvaluator(expr);
    }
    return true;
  }

  public async runOperation(pattern: Algebra.OrderBy, context?: {[id: string]: any})
    : Promise<IActorQueryOperationOutputBindings> {
    const output: IActorQueryOperationOutputBindings =
      ActorQueryOperation.getSafeBindings(await this.mediatorQueryOperation.mediate(
        { operation: pattern.input, context }));

    let bindingsStream = output.bindingsStream;
    const options = { window: this.window };

    for (let expr of pattern.expressions) {
      let ascending = true;
      if (expr.expressionType === Algebra.expressionTypes.OPERATOR) {
        const op = <Algebra.OperatorExpression> expr;
        if (op.operator === 'desc') {
          ascending = false;
          expr = op.args[0];
        }
      }
      const origin = output.bindingsStream;

      // Transform the stream by annotating it with the expr result
      const evaluator = new AsyncEvaluator(expr);
      interface IAnnotatedBinding { bindings: Bindings; result: Term; }
      const transform = (bindings: Bindings, next: any) => {
        evaluator.evaluate(bindings)
          .then((result) => transformedStream._push({bindings, result}))
          .then(next)
          .catch((err) => transformedStream.emit('error', err));
      };
      const transformedStream = origin.transform<IAnnotatedBinding>({transform});

      // Sort the annoted stream
      const sortedStream = new SortIterator(transformedStream, (a, b) => {
        const orderA = termToString(a.result);
        const orderB = termToString(b.result);
        if (!orderA || !orderB) {
          return 0;
        }
        return orderA > orderB === ascending ? 1 : -1;
      }, options);

      // Remove the annotation
      bindingsStream = sortedStream.map(({bindings, result}) => bindings);
    }

    return { type: 'bindings', bindingsStream, metadata: output.metadata, variables: output.variables };
  }

}

/**
 * The window parameter determines how many of the elements to consider when sorting.
 */
export interface IActorQueryOperationOrderByDirectArgs extends IActorQueryOperationTypedMediatedArgs {
  window?: number;
}