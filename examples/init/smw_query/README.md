# ASK and SPARQL Queries
> Read the latest version [online at GitHub](https://github.com/Fannon/mobo/blob/master/examples/init/smw_query/README.md).

## Description
ASK or SPARQL Queries can be stored in this directory. Mobo will automat-ically generate a template (including documentation) with which the query can be embedded. Queries are also tagged with categories.

### Create an ASK Query
Save the ASK query with the file extension `.ask`.

```text
{{#ask: [[category:NetworkPrinterModel]]
| ?brand
| ?modelName
| limit=999
}}
```