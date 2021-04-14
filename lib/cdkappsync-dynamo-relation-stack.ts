import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class CdkappsyncDynamoRelationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const PREFIX_NAME = id.toLowerCase().replace("stack", "")

    const api = new appsync.GraphqlApi(this, "api", {
      name: PREFIX_NAME + "-api",
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
      schema: new appsync.Schema({
        filePath: "graphql/schema.graphql",
      }),
    })

    const product_table = new dynamodb.Table(this, "product_table", {
      tableName: PREFIX_NAME + "-product",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })
    
    const variant_table = new dynamodb.Table(this, "variant_table", {
      tableName: PREFIX_NAME + "-variant",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    variant_table.addGlobalSecondaryIndex({
      indexName: "product-gsi",
      partitionKey: {
        name: "productId",
        type: dynamodb.AttributeType.STRING,
      },
    })

    const product_datasource = api.addDynamoDbDataSource(
      "product_datasource",
      product_table
    )

    const variant_datasource = api.addDynamoDbDataSource(
      "variant_datasource",
      variant_table
    )

    product_datasource.createResolver({
      typeName: "Query",
      fieldName: "listProducts",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    });

    product_datasource.createResolver({
      typeName: "Query",
      fieldName: "getProduct",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem(
        "id",
        "id"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    product_datasource.createResolver({
      typeName: "Mutation",
      fieldName: "addProduct",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    })

    variant_datasource.createResolver({
      typeName: "Query",
      fieldName: "listVariants",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })
    
    // query string for list variants
    // $context.arguments.productId

    const query_string = `{
      "version": "2017-02-28",
      "operation": "Query",
      "index": "product-gsi",
      "query": {
        "expression": "productId = :productId",
        "expressionValues": {
          ":productId": {
            "S": $util.toJson($context.arguments.productId)
          }
        }
      }
    }`
    
    variant_datasource.createResolver({
      typeName: "Query",
      fieldName: "listVariantsByProduct",
      requestMappingTemplate: appsync.MappingTemplate.fromString(query_string),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })
    
    // query string for list products with variants
    // $context.source.productId
    
    const product_variants_relation_query_string = `{
      "version": "2017-02-28",
      "operation": "Query",
      "index": "product-gsi",
      "query": {
        "expression": "productId = :productId",
        "expressionValues": {
          ":productId": {
            "S": $util.toJson($context.source.id)
          }
        }
      }
    }`

    variant_datasource.createResolver({
      typeName: "Product",
      fieldName: "variants",
      requestMappingTemplate: appsync.MappingTemplate.fromString(product_variants_relation_query_string),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })

    variant_datasource.createResolver({
      typeName: "Mutation",
      fieldName: "addVariant",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    })
  }
}
