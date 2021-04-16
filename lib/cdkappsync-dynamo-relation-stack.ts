import * as cdk from "@aws-cdk/core";
import * as appsync from "@aws-cdk/aws-appsync";
import * as dynamodb from "@aws-cdk/aws-dynamodb";

export class CdkappsyncDynamoRelationStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const PREFIX_NAME = id.toLowerCase().replace("stack", "")
    const TABLE_GSI_NAME = "productGsi"
    
    // AppSync GraphQL API

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
    
    // Dynamo DB Tables

    const product_table = new dynamodb.Table(this, "product_table", {
      tableName: PREFIX_NAME + "Product",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })
    
    const variant_table = new dynamodb.Table(this, "variant_table", {
      tableName: PREFIX_NAME + "Variant",
      partitionKey: {
        name: "id",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    variant_table.addGlobalSecondaryIndex({
      indexName: TABLE_GSI_NAME,
      partitionKey: {
        name: "productId",
        type: dynamodb.AttributeType.STRING,
      },
    })
    
    // AppSync Datasource
    
    const product_datasource = api.addDynamoDbDataSource(
      "product_datasource",
      product_table
    )
    
    const variant_datasource = api.addDynamoDbDataSource(
      "variant_datasource",
      variant_table
    )
    
    // Grant access to another table
    // This is for batch write item relation

    variant_table.grantReadWriteData(product_datasource)
    // product_table.grantReadWriteData(variant_datasource)
    
    // AppSync Resolver

    product_datasource.createResolver({
      typeName: "Query",
      fieldName: "listProducts",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })

    product_datasource.createResolver({
      typeName: "Query",
      fieldName: "getProduct",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem(
        "id",
        "id"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    })

    product_datasource.createResolver({
      typeName: "Mutation",
      fieldName: "addProduct",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbPutItem(
        appsync.PrimaryKey.partition("id").auto(),
        appsync.Values.projecting("input")
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    })
    
    product_datasource.createResolver({
      typeName: "Mutation",
      fieldName: "updateProduct",
      requestMappingTemplate: appsync.MappingTemplate.fromFile(
        "mapping_template/update_product.vtl"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem()
    })

    variant_datasource.createResolver({
      typeName: "Query",
      fieldName: "listVariants",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbScanTable(),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })

    variant_datasource.createResolver({
      typeName: "Query",
      fieldName: "listProductVariants",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbQuery(
        appsync.KeyCondition.eq("productId", "productId"),
        TABLE_GSI_NAME
      ),  
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
    
    // Batch write resolver
    
    product_datasource.createResolver({
      typeName: "Mutation",
      fieldName: "addProductWithDefaultVariant",
      requestMappingTemplate: appsync.MappingTemplate.fromFile(
        "mapping_template/add_product_with_default_variant.vtl"
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromFile(
        "mapping_template/add_product_with_default_variant_result.vtl"
      ),
    })
    
    // Resolver for relation
    
    variant_datasource.createResolver({
      typeName: "Product",
      fieldName: "variants",
      requestMappingTemplate: appsync.MappingTemplate.fromFile(
        "mapping_template/product_variant.vtl"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultList(),
    })
    
  }
}
