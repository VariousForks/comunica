import {IActorQueryOperationOutputBindings, IActorQueryOperationOutputBoolean,
  IActorQueryOperationOutputQuads} from "@comunica/bus-query-operation";
import {ActorSparqlSerializeFixedMediaTypes, IActionSparqlSerialize,
  IActorSparqlSerializeFixedMediaTypesArgs, IActorSparqlSerializeOutput} from "@comunica/bus-sparql-serialize";
import * as RdfString from "rdf-string";
import {Readable} from "stream";

/**
 * A comunica JSON SPARQL Serialize Actor.
 */
export class ActorSparqlSerializeJson extends ActorSparqlSerializeFixedMediaTypes {

  constructor(args: IActorSparqlSerializeFixedMediaTypesArgs) {
    super(args);
  }

  public async testHandleChecked(action: IActionSparqlSerialize) {
    if (['bindings', 'quads', 'boolean'].indexOf(action.type) < 0) {
      throw new Error('This actor can only handle bindings or quad streams.');
    }
    return true;
  }

  public async runHandle(action: IActionSparqlSerialize, mediaType: string): Promise<IActorSparqlSerializeOutput> {
    const data = new Readable();
    data._read = () => {
      return;
    };

    let empty: boolean = true;
    if (action.type === 'bindings') {
      const resultStream = (<IActorQueryOperationOutputBindings> action).bindingsStream;
      data.push('[');
      resultStream.on('error', (e) => data.emit('error', e));
      resultStream.on('data', (element) => {
        data.push(empty ? '\n' : ',\n');
        data.push(JSON.stringify(element.map(RdfString.termToString)).trim());
        empty = false;
      });
      resultStream.on('end', () => {
        data.push(empty ? ']\n' : '\n]\n');
        data.push(null);
      });
    } else if (action.type === 'quads') {
      const resultStream = (<IActorQueryOperationOutputQuads> action).quadStream;
      data.push('[');
      resultStream.on('error', (e) => data.emit('error', e));
      resultStream.on('data', (element) => {
        data.push(empty ? '\n' : ',\n');
        data.push(JSON.stringify(RdfString.quadToStringQuad(element)).trim());
        empty = false;
      });
      resultStream.on('end', () => {
        data.push(empty ? ']\n' : '\n]\n');
        data.push(null);
      });
    } else {
      try {
        data.push(JSON.stringify(await (<IActorQueryOperationOutputBoolean> action).booleanResult) + '\n');
        data.push(null);
      } catch (e) {
        setImmediate(() => data.emit('error', e));
      }
    }

    return { data };
  }

}
