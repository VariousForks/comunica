import {IActionInit, IActorOutputInit} from "@comunica/bus-init";
import {IActorQueryOperationOutput} from "@comunica/bus-query-operation";
import {readFileSync} from "fs";
import minimist = require('minimist');
import {Readable} from "stream";
import {ActorInitSparql as ActorInitSparqlBrowser, IActorInitSparqlArgs} from "./ActorInitSparql-browser";

/**
 * A comunica SPARQL Init Actor.
 */
export class ActorInitSparql extends ActorInitSparqlBrowser {

  constructor(args: IActorInitSparqlArgs) {
    super(args);
  }

  public async run(action: IActionInit): Promise<IActorOutputInit> {
    const args = minimist(action.argv);
    if (!args.listformats && (!this.query && (!(args.q || args.f) && args._.length < (args.c ? 1 : 2)
        || args._.length < (args.c ? 0 : 1) || args.h || args.help))) {
      return { stderr: require('streamify-string')(`comunica-sparql evaluates SPARQL queries

Usage:
  comunica-sparql http://fragments.example.org/dataset [-q] 'SELECT * WHERE { ?s ?p ?o }'
  comunica-sparql http://fragments.example.org/dataset [-q] '{ hero { name friends { name } } }' -i graphql
  comunica-sparql http://fragments.example.org/dataset [-f] query.sparql'
  comunica-sparql hypermedia@http://fragments.example.org/dataset sparql@http://sparql.example.org/ ...

Options:
  -q            evaluate the given SPARQL query string
  -f            evaluate the SPARQL query in the given file
  -c            use the given JSON configuration file (e.g., config.json)
  -t            the MIME type of the output (e.g., application/json)
  --help        print this help message
  --listformats prints the supported MIME types
`) };
    }

    // Print supported MIME types
    if (args.listformats) {
      const mediaTypes: {[id: string]: number} = await this.getResultMediaTypes();
      return { stdout: require('streamify-string')(Object.keys(mediaTypes).join('\n')) };
    }

    // Define query
    let query: string = null;
    if (args.q) {
      if (typeof args.q !== 'string') {
        throw new Error('The query option must be a string');
      }
      query = args.q;
    } else if (args.f) {
      query = readFileSync(args.f, { encoding: 'utf8' });
    } else {
      query = args._.pop();
      if (!query) {
        query = this.query;
      }
    }

    // Define context
    let context: any = null;
    if (args.c) {
      context = JSON.parse(readFileSync(args.c, { encoding: 'utf8' }));
    } else if (this.context) {
      context = JSON.parse(this.context);
    } else {
      context = {};
    }

    // Define the query format
    context.queryFormat = 'sparql'; // Default to SPARQL
    if (args.i) {
      context.queryFormat = args.i;
    }

    // Add sources to context
    if (args._.length > 0) {
      context.sources = context.sources || [];
      args._.forEach((sourceValue: string) => {
        const source: {[id: string]: string} = {};
        const splitValues: string[] = sourceValue.split('@', 2);
        if (splitValues.length === 1) {
          // Set default type
          source.type = 'hypermedia';
        } else {
          source.type = splitValues[0];
        }
        source.value = splitValues[splitValues.length - 1];
        context.sources.push(source);
      });
    }

    // Evaluate query
    const queryResult: IActorQueryOperationOutput = await this.evaluateQuery(query, context);

    // Serialize output according to media type
    const stdout: Readable = <Readable> (await this.resultToString(queryResult, args.t, context)).data;

    return { stdout };
  }

}
