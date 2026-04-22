// @ts-nocheck
import { GraphQLResolveInfo, SelectionSetNode, FieldNode, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
import { gql } from '@graphql-mesh/utils';

import type { GetMeshOptions } from '@graphql-mesh/runtime';
import type { YamlConfig } from '@graphql-mesh/types';
import { PubSub } from '@graphql-mesh/utils';
import { DefaultLogger } from '@graphql-mesh/utils';
import MeshCache from "@graphql-mesh/cache-localforage";
import { fetch as fetchFn } from '@whatwg-node/fetch';

import { MeshResolvedSource } from '@graphql-mesh/runtime';
import { MeshTransform, MeshPlugin } from '@graphql-mesh/types';
import GraphqlHandler from "@graphql-mesh/graphql"
import BareMerger from "@graphql-mesh/merger-bare";
import { printWithCache } from '@graphql-mesh/utils';
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import { createMeshHTTPHandler, MeshHTTPHandler } from '@graphql-mesh/http';
import { getMesh, ExecuteMeshFn, SubscribeMeshFn, MeshContext as BaseMeshContext, MeshInstance } from '@graphql-mesh/runtime';
import { MeshStore, FsStoreStorageAdapter } from '@graphql-mesh/store';
import { path as pathModule } from '@graphql-mesh/cross-helpers';
import { ImportFn } from '@graphql-mesh/types';
import type { FangornMusicTypes } from './sources/FangornMusic/types';
import * as importedModule$0 from "./sources/FangornMusic/introspectionSchema";
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };



/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  BigDecimal: { input: any; output: any; }
  BigInt: { input: any; output: any; }
  Bytes: { input: any; output: any; }
  Int8: { input: any; output: any; }
  Timestamp: { input: any; output: any; }
};

/** Indicates whether the current, partially filled bucket should be included in the response. Defaults to `exclude` */
export type Aggregation_current =
  /** Exclude the current, partially filled bucket from the response */
  | 'exclude'
  /** Include the current, partially filled bucket in the response */
  | 'include';

export type Aggregation_interval =
  | 'hour'
  | 'day';

export type BlockChangedFilter = {
  number_gte: Scalars['Int']['input'];
};

export type Block_height = {
  hash?: InputMaybe<Scalars['Bytes']['input']>;
  number?: InputMaybe<Scalars['Int']['input']>;
  number_gte?: InputMaybe<Scalars['Int']['input']>;
};

export type File = {
  id: Scalars['ID']['output'];
  schemaId: Scalars['Bytes']['output'];
  schemaName: Scalars['String']['output'];
  manifestStateId: Scalars['Bytes']['output'];
  manifest: Manifest;
  name?: Maybe<Scalars['String']['output']>;
  fileFields?: Maybe<Array<FileField>>;
};


export type FilefileFieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<FileField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<FileField_filter>;
};

export type FileField = {
  id: Scalars['ID']['output'];
  schemaId: Scalars['Bytes']['output'];
  schemaName: Scalars['String']['output'];
  manifestStateId: Scalars['Bytes']['output'];
  name?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
  atType?: Maybe<Scalars['String']['output']>;
  acc?: Maybe<Scalars['String']['output']>;
  fileId: Scalars['String']['output'];
  file: File;
  pricing?: Maybe<PricingResource>;
};

export type FileField_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaName?: InputMaybe<Scalars['String']['input']>;
  schemaName_not?: InputMaybe<Scalars['String']['input']>;
  schemaName_gt?: InputMaybe<Scalars['String']['input']>;
  schemaName_lt?: InputMaybe<Scalars['String']['input']>;
  schemaName_gte?: InputMaybe<Scalars['String']['input']>;
  schemaName_lte?: InputMaybe<Scalars['String']['input']>;
  schemaName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestStateId?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  value?: InputMaybe<Scalars['String']['input']>;
  value_not?: InputMaybe<Scalars['String']['input']>;
  value_gt?: InputMaybe<Scalars['String']['input']>;
  value_lt?: InputMaybe<Scalars['String']['input']>;
  value_gte?: InputMaybe<Scalars['String']['input']>;
  value_lte?: InputMaybe<Scalars['String']['input']>;
  value_in?: InputMaybe<Array<Scalars['String']['input']>>;
  value_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  value_contains?: InputMaybe<Scalars['String']['input']>;
  value_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  value_not_contains?: InputMaybe<Scalars['String']['input']>;
  value_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  value_starts_with?: InputMaybe<Scalars['String']['input']>;
  value_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  value_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  value_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  value_ends_with?: InputMaybe<Scalars['String']['input']>;
  value_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  value_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  value_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  atType?: InputMaybe<Scalars['String']['input']>;
  atType_not?: InputMaybe<Scalars['String']['input']>;
  atType_gt?: InputMaybe<Scalars['String']['input']>;
  atType_lt?: InputMaybe<Scalars['String']['input']>;
  atType_gte?: InputMaybe<Scalars['String']['input']>;
  atType_lte?: InputMaybe<Scalars['String']['input']>;
  atType_in?: InputMaybe<Array<Scalars['String']['input']>>;
  atType_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  atType_contains?: InputMaybe<Scalars['String']['input']>;
  atType_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  atType_not_contains?: InputMaybe<Scalars['String']['input']>;
  atType_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  atType_starts_with?: InputMaybe<Scalars['String']['input']>;
  atType_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  atType_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  atType_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  atType_ends_with?: InputMaybe<Scalars['String']['input']>;
  atType_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  atType_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  atType_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  acc?: InputMaybe<Scalars['String']['input']>;
  acc_not?: InputMaybe<Scalars['String']['input']>;
  acc_gt?: InputMaybe<Scalars['String']['input']>;
  acc_lt?: InputMaybe<Scalars['String']['input']>;
  acc_gte?: InputMaybe<Scalars['String']['input']>;
  acc_lte?: InputMaybe<Scalars['String']['input']>;
  acc_in?: InputMaybe<Array<Scalars['String']['input']>>;
  acc_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  acc_contains?: InputMaybe<Scalars['String']['input']>;
  acc_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  acc_not_contains?: InputMaybe<Scalars['String']['input']>;
  acc_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  acc_starts_with?: InputMaybe<Scalars['String']['input']>;
  acc_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  acc_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  acc_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  acc_ends_with?: InputMaybe<Scalars['String']['input']>;
  acc_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  acc_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  acc_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId?: InputMaybe<Scalars['String']['input']>;
  fileId_not?: InputMaybe<Scalars['String']['input']>;
  fileId_gt?: InputMaybe<Scalars['String']['input']>;
  fileId_lt?: InputMaybe<Scalars['String']['input']>;
  fileId_gte?: InputMaybe<Scalars['String']['input']>;
  fileId_lte?: InputMaybe<Scalars['String']['input']>;
  fileId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fileId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fileId_contains?: InputMaybe<Scalars['String']['input']>;
  fileId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId_not_contains?: InputMaybe<Scalars['String']['input']>;
  fileId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId_starts_with?: InputMaybe<Scalars['String']['input']>;
  fileId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  fileId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId_ends_with?: InputMaybe<Scalars['String']['input']>;
  fileId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  fileId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  file?: InputMaybe<Scalars['String']['input']>;
  file_not?: InputMaybe<Scalars['String']['input']>;
  file_gt?: InputMaybe<Scalars['String']['input']>;
  file_lt?: InputMaybe<Scalars['String']['input']>;
  file_gte?: InputMaybe<Scalars['String']['input']>;
  file_lte?: InputMaybe<Scalars['String']['input']>;
  file_in?: InputMaybe<Array<Scalars['String']['input']>>;
  file_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  file_contains?: InputMaybe<Scalars['String']['input']>;
  file_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  file_not_contains?: InputMaybe<Scalars['String']['input']>;
  file_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  file_starts_with?: InputMaybe<Scalars['String']['input']>;
  file_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  file_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  file_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  file_ends_with?: InputMaybe<Scalars['String']['input']>;
  file_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  file_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  file_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  file_?: InputMaybe<File_filter>;
  pricing?: InputMaybe<Scalars['String']['input']>;
  pricing_not?: InputMaybe<Scalars['String']['input']>;
  pricing_gt?: InputMaybe<Scalars['String']['input']>;
  pricing_lt?: InputMaybe<Scalars['String']['input']>;
  pricing_gte?: InputMaybe<Scalars['String']['input']>;
  pricing_lte?: InputMaybe<Scalars['String']['input']>;
  pricing_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pricing_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pricing_contains?: InputMaybe<Scalars['String']['input']>;
  pricing_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_not_contains?: InputMaybe<Scalars['String']['input']>;
  pricing_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_starts_with?: InputMaybe<Scalars['String']['input']>;
  pricing_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  pricing_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_ends_with?: InputMaybe<Scalars['String']['input']>;
  pricing_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  pricing_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  pricing_?: InputMaybe<PricingResource_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<FileField_filter>>>;
  or?: InputMaybe<Array<InputMaybe<FileField_filter>>>;
};

export type FileField_orderBy =
  | 'id'
  | 'schemaId'
  | 'schemaName'
  | 'manifestStateId'
  | 'name'
  | 'value'
  | 'atType'
  | 'acc'
  | 'fileId'
  | 'file'
  | 'file__id'
  | 'file__schemaId'
  | 'file__schemaName'
  | 'file__manifestStateId'
  | 'file__name'
  | 'pricing'
  | 'pricing__id'
  | 'pricing__owner'
  | 'pricing__price'
  | 'pricing__currency';

export type File_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaName?: InputMaybe<Scalars['String']['input']>;
  schemaName_not?: InputMaybe<Scalars['String']['input']>;
  schemaName_gt?: InputMaybe<Scalars['String']['input']>;
  schemaName_lt?: InputMaybe<Scalars['String']['input']>;
  schemaName_gte?: InputMaybe<Scalars['String']['input']>;
  schemaName_lte?: InputMaybe<Scalars['String']['input']>;
  schemaName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestStateId?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifest?: InputMaybe<Scalars['String']['input']>;
  manifest_not?: InputMaybe<Scalars['String']['input']>;
  manifest_gt?: InputMaybe<Scalars['String']['input']>;
  manifest_lt?: InputMaybe<Scalars['String']['input']>;
  manifest_gte?: InputMaybe<Scalars['String']['input']>;
  manifest_lte?: InputMaybe<Scalars['String']['input']>;
  manifest_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_?: InputMaybe<Manifest_filter>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileFields_?: InputMaybe<FileField_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<File_filter>>>;
  or?: InputMaybe<Array<InputMaybe<File_filter>>>;
};

export type File_orderBy =
  | 'id'
  | 'schemaId'
  | 'schemaName'
  | 'manifestStateId'
  | 'manifest'
  | 'manifest__id'
  | 'manifest__schemaId'
  | 'manifest__schemaName'
  | 'manifest__manifestStateId'
  | 'manifest__manifestVersion'
  | 'name'
  | 'fileFields';

export type Manifest = {
  id: Scalars['ID']['output'];
  schemaId: Scalars['Bytes']['output'];
  schemaName: Scalars['String']['output'];
  manifestStateId: Scalars['Bytes']['output'];
  manifestVersion?: Maybe<Scalars['BigInt']['output']>;
  manifestState: ManifestState;
  files?: Maybe<Array<File>>;
};


export type ManifestfilesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<File_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<File_filter>;
};

export type ManifestPublished = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  nameHash: Scalars['Bytes']['output'];
  name: Scalars['String']['output'];
  manifestCid: Scalars['String']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ManifestPublished_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  nameHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  nameHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
};

export type ManifestPublished_orderBy =
  | 'id'
  | 'owner'
  | 'schemaId'
  | 'nameHash'
  | 'name'
  | 'manifestCid'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'transactionHash';

export type ManifestState = {
  id: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  schemaName: Scalars['String']['output'];
  owner: Scalars['Bytes']['output'];
  schema?: Maybe<Schema>;
  manifestCid: Scalars['String']['output'];
  manifest?: Maybe<Manifest>;
  version: Scalars['BigInt']['output'];
  lastUpdated: Scalars['BigInt']['output'];
};

export type ManifestState_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaName?: InputMaybe<Scalars['String']['input']>;
  schemaName_not?: InputMaybe<Scalars['String']['input']>;
  schemaName_gt?: InputMaybe<Scalars['String']['input']>;
  schemaName_lt?: InputMaybe<Scalars['String']['input']>;
  schemaName_gte?: InputMaybe<Scalars['String']['input']>;
  schemaName_lte?: InputMaybe<Scalars['String']['input']>;
  schemaName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schema?: InputMaybe<Scalars['String']['input']>;
  schema_not?: InputMaybe<Scalars['String']['input']>;
  schema_gt?: InputMaybe<Scalars['String']['input']>;
  schema_lt?: InputMaybe<Scalars['String']['input']>;
  schema_gte?: InputMaybe<Scalars['String']['input']>;
  schema_lte?: InputMaybe<Scalars['String']['input']>;
  schema_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schema_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schema_contains?: InputMaybe<Scalars['String']['input']>;
  schema_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_not_contains?: InputMaybe<Scalars['String']['input']>;
  schema_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_starts_with?: InputMaybe<Scalars['String']['input']>;
  schema_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schema_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_ends_with?: InputMaybe<Scalars['String']['input']>;
  schema_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schema_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_?: InputMaybe<Schema_filter>;
  manifestCid?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest?: InputMaybe<Scalars['String']['input']>;
  manifest_not?: InputMaybe<Scalars['String']['input']>;
  manifest_gt?: InputMaybe<Scalars['String']['input']>;
  manifest_lt?: InputMaybe<Scalars['String']['input']>;
  manifest_gte?: InputMaybe<Scalars['String']['input']>;
  manifest_lte?: InputMaybe<Scalars['String']['input']>;
  manifest_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_?: InputMaybe<Manifest_filter>;
  version?: InputMaybe<Scalars['BigInt']['input']>;
  version_not?: InputMaybe<Scalars['BigInt']['input']>;
  version_gt?: InputMaybe<Scalars['BigInt']['input']>;
  version_lt?: InputMaybe<Scalars['BigInt']['input']>;
  version_gte?: InputMaybe<Scalars['BigInt']['input']>;
  version_lte?: InputMaybe<Scalars['BigInt']['input']>;
  version_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  version_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lastUpdated?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_not?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_gt?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_lt?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_gte?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_lte?: InputMaybe<Scalars['BigInt']['input']>;
  lastUpdated_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lastUpdated_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ManifestState_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ManifestState_filter>>>;
};

export type ManifestState_orderBy =
  | 'id'
  | 'schemaId'
  | 'schemaName'
  | 'owner'
  | 'schema'
  | 'schema__id'
  | 'schema__version'
  | 'schema__agentId'
  | 'manifestCid'
  | 'manifest'
  | 'manifest__id'
  | 'manifest__schemaId'
  | 'manifest__schemaName'
  | 'manifest__manifestStateId'
  | 'manifest__manifestVersion'
  | 'version'
  | 'lastUpdated';

export type ManifestUpdated = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  nameHash: Scalars['Bytes']['output'];
  manifestCid: Scalars['String']['output'];
  version: Scalars['BigInt']['output'];
  blockNumber: Scalars['BigInt']['output'];
  blockTimestamp: Scalars['BigInt']['output'];
  transactionHash: Scalars['Bytes']['output'];
};

export type ManifestUpdated_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  nameHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  nameHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  nameHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifestCid?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lt?: InputMaybe<Scalars['String']['input']>;
  manifestCid_gte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_lte?: InputMaybe<Scalars['String']['input']>;
  manifestCid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestCid_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestCid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  version?: InputMaybe<Scalars['BigInt']['input']>;
  version_not?: InputMaybe<Scalars['BigInt']['input']>;
  version_gt?: InputMaybe<Scalars['BigInt']['input']>;
  version_lt?: InputMaybe<Scalars['BigInt']['input']>;
  version_gte?: InputMaybe<Scalars['BigInt']['input']>;
  version_lte?: InputMaybe<Scalars['BigInt']['input']>;
  version_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  version_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_not?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transactionHash?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lt?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_gte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_lte?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  transactionHash_contains?: InputMaybe<Scalars['Bytes']['input']>;
  transactionHash_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ManifestUpdated_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ManifestUpdated_filter>>>;
};

export type ManifestUpdated_orderBy =
  | 'id'
  | 'owner'
  | 'schemaId'
  | 'nameHash'
  | 'manifestCid'
  | 'version'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'transactionHash';

export type Manifest_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaName?: InputMaybe<Scalars['String']['input']>;
  schemaName_not?: InputMaybe<Scalars['String']['input']>;
  schemaName_gt?: InputMaybe<Scalars['String']['input']>;
  schemaName_lt?: InputMaybe<Scalars['String']['input']>;
  schemaName_gte?: InputMaybe<Scalars['String']['input']>;
  schemaName_lte?: InputMaybe<Scalars['String']['input']>;
  schemaName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaName_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaName_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestStateId?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  manifestStateId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifestStateId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifestVersion?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_not?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_gt?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_lt?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_gte?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_lte?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  manifestVersion_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  manifestState?: InputMaybe<Scalars['String']['input']>;
  manifestState_not?: InputMaybe<Scalars['String']['input']>;
  manifestState_gt?: InputMaybe<Scalars['String']['input']>;
  manifestState_lt?: InputMaybe<Scalars['String']['input']>;
  manifestState_gte?: InputMaybe<Scalars['String']['input']>;
  manifestState_lte?: InputMaybe<Scalars['String']['input']>;
  manifestState_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestState_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifestState_contains?: InputMaybe<Scalars['String']['input']>;
  manifestState_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestState_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestState_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifestState_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifestState_?: InputMaybe<ManifestState_filter>;
  files_?: InputMaybe<File_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Manifest_filter>>>;
  or?: InputMaybe<Array<InputMaybe<Manifest_filter>>>;
};

export type Manifest_orderBy =
  | 'id'
  | 'schemaId'
  | 'schemaName'
  | 'manifestStateId'
  | 'manifestVersion'
  | 'manifestState'
  | 'manifestState__id'
  | 'manifestState__schemaId'
  | 'manifestState__schemaName'
  | 'manifestState__owner'
  | 'manifestState__manifestCid'
  | 'manifestState__version'
  | 'manifestState__lastUpdated'
  | 'files';

/** Defines the order direction, either ascending or descending */
export type OrderDirection =
  | 'asc'
  | 'desc';

export type PriceUpdated = {
  id: Scalars['Bytes']['output'];
  resourceId: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  price: Scalars['BigInt']['output'];
};

export type PriceUpdated_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_not?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  resourceId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  resourceId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  price?: InputMaybe<Scalars['BigInt']['input']>;
  price_not?: InputMaybe<Scalars['BigInt']['input']>;
  price_gt?: InputMaybe<Scalars['BigInt']['input']>;
  price_lt?: InputMaybe<Scalars['BigInt']['input']>;
  price_gte?: InputMaybe<Scalars['BigInt']['input']>;
  price_lte?: InputMaybe<Scalars['BigInt']['input']>;
  price_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  price_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PriceUpdated_filter>>>;
  or?: InputMaybe<Array<InputMaybe<PriceUpdated_filter>>>;
};

export type PriceUpdated_orderBy =
  | 'id'
  | 'resourceId'
  | 'owner'
  | 'price';

export type PricingResource = {
  id: Scalars['ID']['output'];
  owner: Scalars['Bytes']['output'];
  price: Scalars['BigInt']['output'];
  currency: Scalars['String']['output'];
};

export type PricingResource_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  price?: InputMaybe<Scalars['BigInt']['input']>;
  price_not?: InputMaybe<Scalars['BigInt']['input']>;
  price_gt?: InputMaybe<Scalars['BigInt']['input']>;
  price_lt?: InputMaybe<Scalars['BigInt']['input']>;
  price_gte?: InputMaybe<Scalars['BigInt']['input']>;
  price_lte?: InputMaybe<Scalars['BigInt']['input']>;
  price_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  price_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  currency?: InputMaybe<Scalars['String']['input']>;
  currency_not?: InputMaybe<Scalars['String']['input']>;
  currency_gt?: InputMaybe<Scalars['String']['input']>;
  currency_lt?: InputMaybe<Scalars['String']['input']>;
  currency_gte?: InputMaybe<Scalars['String']['input']>;
  currency_lte?: InputMaybe<Scalars['String']['input']>;
  currency_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currency_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currency_contains?: InputMaybe<Scalars['String']['input']>;
  currency_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  currency_not_contains?: InputMaybe<Scalars['String']['input']>;
  currency_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  currency_starts_with?: InputMaybe<Scalars['String']['input']>;
  currency_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  currency_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  currency_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  currency_ends_with?: InputMaybe<Scalars['String']['input']>;
  currency_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  currency_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  currency_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<PricingResource_filter>>>;
  or?: InputMaybe<Array<InputMaybe<PricingResource_filter>>>;
};

export type PricingResource_orderBy =
  | 'id'
  | 'owner'
  | 'price'
  | 'currency';

export type Query = {
  manifestPublished?: Maybe<ManifestPublished>;
  manifestPublisheds: Array<ManifestPublished>;
  manifestUpdated?: Maybe<ManifestUpdated>;
  manifestUpdateds: Array<ManifestUpdated>;
  schemaRegistered?: Maybe<SchemaRegistered>;
  schemaRegistereds: Array<SchemaRegistered>;
  schemaUpdated?: Maybe<SchemaUpdated>;
  schemaUpdateds: Array<SchemaUpdated>;
  resourceCreated?: Maybe<ResourceCreated>;
  resourceCreateds: Array<ResourceCreated>;
  priceUpdated?: Maybe<PriceUpdated>;
  priceUpdateds: Array<PriceUpdated>;
  schemaState?: Maybe<SchemaState>;
  schemaStates: Array<SchemaState>;
  schema?: Maybe<Schema>;
  schemas: Array<Schema>;
  schemaField?: Maybe<SchemaField>;
  schemaFields: Array<SchemaField>;
  manifestState?: Maybe<ManifestState>;
  manifestStates: Array<ManifestState>;
  manifest?: Maybe<Manifest>;
  manifests: Array<Manifest>;
  file?: Maybe<File>;
  files: Array<File>;
  fileField?: Maybe<FileField>;
  fileFields: Array<FileField>;
  pricingResource?: Maybe<PricingResource>;
  pricingResources: Array<PricingResource>;
  /** Access to subgraph metadata */
  _meta?: Maybe<_Meta_>;
};


export type QuerymanifestPublishedArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestPublishedsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ManifestPublished_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ManifestPublished_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestUpdatedArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestUpdatedsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ManifestUpdated_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ManifestUpdated_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaRegisteredArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaRegisteredsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaRegistered_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaRegistered_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaUpdatedArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaUpdatedsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaUpdated_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaUpdated_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryresourceCreatedArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryresourceCreatedsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ResourceCreated_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ResourceCreated_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerypriceUpdatedArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerypriceUpdatedsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PriceUpdated_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<PriceUpdated_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaStateArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaStatesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaState_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaState_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemasArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Schema_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<Schema_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaFieldArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaFieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaField_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestStateArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestStatesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ManifestState_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ManifestState_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerymanifestsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Manifest_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<Manifest_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfileArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfilesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<File_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<File_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfileFieldArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfileFieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<FileField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<FileField_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerypricingResourceArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QuerypricingResourcesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<PricingResource_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<PricingResource_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type Query_metaArgs = {
  block?: InputMaybe<Block_height>;
};

export type ResourceCreated = {
  id: Scalars['Bytes']['output'];
  resourceId: Scalars['Bytes']['output'];
  groupId: Scalars['BigInt']['output'];
  owner: Scalars['Bytes']['output'];
  price: Scalars['BigInt']['output'];
};

export type ResourceCreated_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_not?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  resourceId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  resourceId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  resourceId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  groupId?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_not?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  groupId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  groupId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  price?: InputMaybe<Scalars['BigInt']['input']>;
  price_not?: InputMaybe<Scalars['BigInt']['input']>;
  price_gt?: InputMaybe<Scalars['BigInt']['input']>;
  price_lt?: InputMaybe<Scalars['BigInt']['input']>;
  price_gte?: InputMaybe<Scalars['BigInt']['input']>;
  price_lte?: InputMaybe<Scalars['BigInt']['input']>;
  price_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  price_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<ResourceCreated_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ResourceCreated_filter>>>;
};

export type ResourceCreated_orderBy =
  | 'id'
  | 'resourceId'
  | 'groupId'
  | 'owner'
  | 'price';

export type Schema = {
  id: Scalars['ID']['output'];
  manifestStates?: Maybe<Array<ManifestState>>;
  version?: Maybe<Scalars['String']['output']>;
  agentId?: Maybe<Scalars['String']['output']>;
  fields?: Maybe<Array<SchemaField>>;
};


export type SchemamanifestStatesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ManifestState_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ManifestState_filter>;
};


export type SchemafieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaField_filter>;
};

export type SchemaField = {
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  fieldType: Scalars['String']['output'];
};

export type SchemaField_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType?: InputMaybe<Scalars['String']['input']>;
  fieldType_not?: InputMaybe<Scalars['String']['input']>;
  fieldType_gt?: InputMaybe<Scalars['String']['input']>;
  fieldType_lt?: InputMaybe<Scalars['String']['input']>;
  fieldType_gte?: InputMaybe<Scalars['String']['input']>;
  fieldType_lte?: InputMaybe<Scalars['String']['input']>;
  fieldType_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fieldType_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fieldType_contains?: InputMaybe<Scalars['String']['input']>;
  fieldType_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_contains?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType_starts_with?: InputMaybe<Scalars['String']['input']>;
  fieldType_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType_ends_with?: InputMaybe<Scalars['String']['input']>;
  fieldType_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  fieldType_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaField_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaField_filter>>>;
};

export type SchemaField_orderBy =
  | 'id'
  | 'name'
  | 'fieldType';

export type SchemaRegistered = {
  id: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  name: Scalars['String']['output'];
  ipfsCid: Scalars['String']['output'];
  agentId: Scalars['String']['output'];
};

export type SchemaRegistered_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_gt?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_lt?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_gte?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_lte?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  ipfsCid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  ipfsCid_contains?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_contains?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_starts_with?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_ends_with?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  ipfsCid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId?: InputMaybe<Scalars['String']['input']>;
  agentId_not?: InputMaybe<Scalars['String']['input']>;
  agentId_gt?: InputMaybe<Scalars['String']['input']>;
  agentId_lt?: InputMaybe<Scalars['String']['input']>;
  agentId_gte?: InputMaybe<Scalars['String']['input']>;
  agentId_lte?: InputMaybe<Scalars['String']['input']>;
  agentId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agentId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agentId_contains?: InputMaybe<Scalars['String']['input']>;
  agentId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_contains?: InputMaybe<Scalars['String']['input']>;
  agentId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_starts_with?: InputMaybe<Scalars['String']['input']>;
  agentId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  agentId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_ends_with?: InputMaybe<Scalars['String']['input']>;
  agentId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  agentId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaRegistered_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaRegistered_filter>>>;
};

export type SchemaRegistered_orderBy =
  | 'id'
  | 'schemaId'
  | 'owner'
  | 'name'
  | 'ipfsCid'
  | 'agentId';

export type SchemaState = {
  id: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  name: Scalars['String']['output'];
  versions?: Maybe<Array<Schema>>;
};


export type SchemaStateversionsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Schema_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<Schema_filter>;
};

export type SchemaState_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lt?: InputMaybe<Scalars['Bytes']['input']>;
  owner_gte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_lte?: InputMaybe<Scalars['Bytes']['input']>;
  owner_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  owner_contains?: InputMaybe<Scalars['Bytes']['input']>;
  owner_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  name_not?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  name_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  versions?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_not?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_not_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_not_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  versions_?: InputMaybe<Schema_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaState_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaState_filter>>>;
};

export type SchemaState_orderBy =
  | 'id'
  | 'schemaId'
  | 'owner'
  | 'name'
  | 'versions';

export type SchemaUpdated = {
  id: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  newIpfsCid: Scalars['String']['output'];
  newAgentId: Scalars['String']['output'];
};

export type SchemaUpdated_filter = {
  id?: InputMaybe<Scalars['Bytes']['input']>;
  id_not?: InputMaybe<Scalars['Bytes']['input']>;
  id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  newIpfsCid?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_gt?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_lt?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_gte?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_lte?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  newIpfsCid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  newIpfsCid_contains?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_contains?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_starts_with?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_ends_with?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  newIpfsCid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not?: InputMaybe<Scalars['String']['input']>;
  newAgentId_gt?: InputMaybe<Scalars['String']['input']>;
  newAgentId_lt?: InputMaybe<Scalars['String']['input']>;
  newAgentId_gte?: InputMaybe<Scalars['String']['input']>;
  newAgentId_lte?: InputMaybe<Scalars['String']['input']>;
  newAgentId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  newAgentId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  newAgentId_contains?: InputMaybe<Scalars['String']['input']>;
  newAgentId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_contains?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId_starts_with?: InputMaybe<Scalars['String']['input']>;
  newAgentId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId_ends_with?: InputMaybe<Scalars['String']['input']>;
  newAgentId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  newAgentId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaUpdated_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaUpdated_filter>>>;
};

export type SchemaUpdated_orderBy =
  | 'id'
  | 'schemaId'
  | 'newIpfsCid'
  | 'newAgentId';

export type Schema_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  manifestStates_?: InputMaybe<ManifestState_filter>;
  version?: InputMaybe<Scalars['String']['input']>;
  version_not?: InputMaybe<Scalars['String']['input']>;
  version_gt?: InputMaybe<Scalars['String']['input']>;
  version_lt?: InputMaybe<Scalars['String']['input']>;
  version_gte?: InputMaybe<Scalars['String']['input']>;
  version_lte?: InputMaybe<Scalars['String']['input']>;
  version_in?: InputMaybe<Array<Scalars['String']['input']>>;
  version_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  version_contains?: InputMaybe<Scalars['String']['input']>;
  version_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  version_not_contains?: InputMaybe<Scalars['String']['input']>;
  version_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  version_starts_with?: InputMaybe<Scalars['String']['input']>;
  version_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  version_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  version_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  version_ends_with?: InputMaybe<Scalars['String']['input']>;
  version_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  version_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  version_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId?: InputMaybe<Scalars['String']['input']>;
  agentId_not?: InputMaybe<Scalars['String']['input']>;
  agentId_gt?: InputMaybe<Scalars['String']['input']>;
  agentId_lt?: InputMaybe<Scalars['String']['input']>;
  agentId_gte?: InputMaybe<Scalars['String']['input']>;
  agentId_lte?: InputMaybe<Scalars['String']['input']>;
  agentId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agentId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agentId_contains?: InputMaybe<Scalars['String']['input']>;
  agentId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_contains?: InputMaybe<Scalars['String']['input']>;
  agentId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_starts_with?: InputMaybe<Scalars['String']['input']>;
  agentId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  agentId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_ends_with?: InputMaybe<Scalars['String']['input']>;
  agentId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agentId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  agentId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fields?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_?: InputMaybe<SchemaField_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Schema_filter>>>;
  or?: InputMaybe<Array<InputMaybe<Schema_filter>>>;
};

export type Schema_orderBy =
  | 'id'
  | 'manifestStates'
  | 'version'
  | 'agentId'
  | 'fields';

export type _Block_ = {
  /** The hash of the block */
  hash?: Maybe<Scalars['Bytes']['output']>;
  /** The block number */
  number: Scalars['Int']['output'];
  /** Integer representation of the timestamp stored in blocks for the chain */
  timestamp?: Maybe<Scalars['Int']['output']>;
  /** The hash of the parent block */
  parentHash?: Maybe<Scalars['Bytes']['output']>;
};

/** The type for the top-level _meta field */
export type _Meta_ = {
  /**
   * Information about a specific subgraph block. The hash of the block
   * will be null if the _meta field has a block constraint that asks for
   * a block number. It will be filled if the _meta field has no block constraint
   * and therefore asks for the latest  block
   */
  block: _Block_;
  /** The deployment ID */
  deployment: Scalars['String']['output'];
  /** If `true`, the subgraph encountered indexing errors at some past block */
  hasIndexingErrors: Scalars['Boolean']['output'];
};

export type _SubgraphErrorPolicy_ =
  /** Data will be returned even if the subgraph has indexing errors */
  | 'allow'
  /** If the subgraph has indexing errors, data will be omitted. The default. */
  | 'deny';

export type WithIndex<TObject> = TObject & Record<string, any>;
export type ResolversObject<TObject> = WithIndex<TObject>;

export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type LegacyStitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type NewStitchingResolver<TResult, TParent, TContext, TArgs> = {
  selectionSet: string | ((fieldNode: FieldNode) => SelectionSetNode);
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type StitchingResolver<TResult, TParent, TContext, TArgs> = LegacyStitchingResolver<TResult, TParent, TContext, TArgs> | NewStitchingResolver<TResult, TParent, TContext, TArgs>;
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = ResolversObject<{
  Aggregation_current: Aggregation_current;
  Aggregation_interval: Aggregation_interval;
  BigDecimal: ResolverTypeWrapper<Scalars['BigDecimal']['output']>;
  BigInt: ResolverTypeWrapper<Scalars['BigInt']['output']>;
  BlockChangedFilter: BlockChangedFilter;
  Block_height: Block_height;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Bytes: ResolverTypeWrapper<Scalars['Bytes']['output']>;
  File: ResolverTypeWrapper<File>;
  FileField: ResolverTypeWrapper<FileField>;
  FileField_filter: FileField_filter;
  FileField_orderBy: FileField_orderBy;
  File_filter: File_filter;
  File_orderBy: File_orderBy;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  Int8: ResolverTypeWrapper<Scalars['Int8']['output']>;
  Manifest: ResolverTypeWrapper<Manifest>;
  ManifestPublished: ResolverTypeWrapper<ManifestPublished>;
  ManifestPublished_filter: ManifestPublished_filter;
  ManifestPublished_orderBy: ManifestPublished_orderBy;
  ManifestState: ResolverTypeWrapper<ManifestState>;
  ManifestState_filter: ManifestState_filter;
  ManifestState_orderBy: ManifestState_orderBy;
  ManifestUpdated: ResolverTypeWrapper<ManifestUpdated>;
  ManifestUpdated_filter: ManifestUpdated_filter;
  ManifestUpdated_orderBy: ManifestUpdated_orderBy;
  Manifest_filter: Manifest_filter;
  Manifest_orderBy: Manifest_orderBy;
  OrderDirection: OrderDirection;
  PriceUpdated: ResolverTypeWrapper<PriceUpdated>;
  PriceUpdated_filter: PriceUpdated_filter;
  PriceUpdated_orderBy: PriceUpdated_orderBy;
  PricingResource: ResolverTypeWrapper<PricingResource>;
  PricingResource_filter: PricingResource_filter;
  PricingResource_orderBy: PricingResource_orderBy;
  Query: ResolverTypeWrapper<{}>;
  ResourceCreated: ResolverTypeWrapper<ResourceCreated>;
  ResourceCreated_filter: ResourceCreated_filter;
  ResourceCreated_orderBy: ResourceCreated_orderBy;
  Schema: ResolverTypeWrapper<Schema>;
  SchemaField: ResolverTypeWrapper<SchemaField>;
  SchemaField_filter: SchemaField_filter;
  SchemaField_orderBy: SchemaField_orderBy;
  SchemaRegistered: ResolverTypeWrapper<SchemaRegistered>;
  SchemaRegistered_filter: SchemaRegistered_filter;
  SchemaRegistered_orderBy: SchemaRegistered_orderBy;
  SchemaState: ResolverTypeWrapper<SchemaState>;
  SchemaState_filter: SchemaState_filter;
  SchemaState_orderBy: SchemaState_orderBy;
  SchemaUpdated: ResolverTypeWrapper<SchemaUpdated>;
  SchemaUpdated_filter: SchemaUpdated_filter;
  SchemaUpdated_orderBy: SchemaUpdated_orderBy;
  Schema_filter: Schema_filter;
  Schema_orderBy: Schema_orderBy;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Timestamp: ResolverTypeWrapper<Scalars['Timestamp']['output']>;
  _Block_: ResolverTypeWrapper<_Block_>;
  _Meta_: ResolverTypeWrapper<_Meta_>;
  _SubgraphErrorPolicy_: _SubgraphErrorPolicy_;
}>;

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = ResolversObject<{
  BigDecimal: Scalars['BigDecimal']['output'];
  BigInt: Scalars['BigInt']['output'];
  BlockChangedFilter: BlockChangedFilter;
  Block_height: Block_height;
  Boolean: Scalars['Boolean']['output'];
  Bytes: Scalars['Bytes']['output'];
  File: File;
  FileField: FileField;
  FileField_filter: FileField_filter;
  File_filter: File_filter;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  Int8: Scalars['Int8']['output'];
  Manifest: Manifest;
  ManifestPublished: ManifestPublished;
  ManifestPublished_filter: ManifestPublished_filter;
  ManifestState: ManifestState;
  ManifestState_filter: ManifestState_filter;
  ManifestUpdated: ManifestUpdated;
  ManifestUpdated_filter: ManifestUpdated_filter;
  Manifest_filter: Manifest_filter;
  PriceUpdated: PriceUpdated;
  PriceUpdated_filter: PriceUpdated_filter;
  PricingResource: PricingResource;
  PricingResource_filter: PricingResource_filter;
  Query: {};
  ResourceCreated: ResourceCreated;
  ResourceCreated_filter: ResourceCreated_filter;
  Schema: Schema;
  SchemaField: SchemaField;
  SchemaField_filter: SchemaField_filter;
  SchemaRegistered: SchemaRegistered;
  SchemaRegistered_filter: SchemaRegistered_filter;
  SchemaState: SchemaState;
  SchemaState_filter: SchemaState_filter;
  SchemaUpdated: SchemaUpdated;
  SchemaUpdated_filter: SchemaUpdated_filter;
  Schema_filter: Schema_filter;
  String: Scalars['String']['output'];
  Timestamp: Scalars['Timestamp']['output'];
  _Block_: _Block_;
  _Meta_: _Meta_;
}>;

export type entityDirectiveArgs = { };

export type entityDirectiveResolver<Result, Parent, ContextType = MeshContext, Args = entityDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type subgraphIdDirectiveArgs = {
  id: Scalars['String']['input'];
};

export type subgraphIdDirectiveResolver<Result, Parent, ContextType = MeshContext, Args = subgraphIdDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type derivedFromDirectiveArgs = {
  field: Scalars['String']['input'];
};

export type derivedFromDirectiveResolver<Result, Parent, ContextType = MeshContext, Args = derivedFromDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export interface BigDecimalScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['BigDecimal'], any> {
  name: 'BigDecimal';
}

export interface BigIntScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['BigInt'], any> {
  name: 'BigInt';
}

export interface BytesScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Bytes'], any> {
  name: 'Bytes';
}

export type FileResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['File'] = ResolversParentTypes['File']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifestStateId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  manifest?: Resolver<ResolversTypes['Manifest'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileFields?: Resolver<Maybe<Array<ResolversTypes['FileField']>>, ParentType, ContextType, RequireFields<FilefileFieldsArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FileFieldResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['FileField'] = ResolversParentTypes['FileField']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifestStateId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  atType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  acc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  file?: Resolver<ResolversTypes['File'], ParentType, ContextType>;
  pricing?: Resolver<Maybe<ResolversTypes['PricingResource']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface Int8ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Int8'], any> {
  name: 'Int8';
}

export type ManifestResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Manifest'] = ResolversParentTypes['Manifest']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifestStateId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  manifestVersion?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  manifestState?: Resolver<ResolversTypes['ManifestState'], ParentType, ContextType>;
  files?: Resolver<Maybe<Array<ResolversTypes['File']>>, ParentType, ContextType, RequireFields<ManifestfilesArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestPublishedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestPublished'] = ResolversParentTypes['ManifestPublished']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  nameHash?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifestCid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  blockTimestamp?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestStateResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestState'] = ResolversParentTypes['ManifestState']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schema?: Resolver<Maybe<ResolversTypes['Schema']>, ParentType, ContextType>;
  manifestCid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifest?: Resolver<Maybe<ResolversTypes['Manifest']>, ParentType, ContextType>;
  version?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  lastUpdated?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestUpdatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestUpdated'] = ResolversParentTypes['ManifestUpdated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  nameHash?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  manifestCid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  blockTimestamp?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PriceUpdatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['PriceUpdated'] = ResolversParentTypes['PriceUpdated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  resourceId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type PricingResourceResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['PricingResource'] = ResolversParentTypes['PricingResource']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type QueryResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = ResolversObject<{
  manifestPublished?: Resolver<Maybe<ResolversTypes['ManifestPublished']>, ParentType, ContextType, RequireFields<QuerymanifestPublishedArgs, 'id' | 'subgraphError'>>;
  manifestPublisheds?: Resolver<Array<ResolversTypes['ManifestPublished']>, ParentType, ContextType, RequireFields<QuerymanifestPublishedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  manifestUpdated?: Resolver<Maybe<ResolversTypes['ManifestUpdated']>, ParentType, ContextType, RequireFields<QuerymanifestUpdatedArgs, 'id' | 'subgraphError'>>;
  manifestUpdateds?: Resolver<Array<ResolversTypes['ManifestUpdated']>, ParentType, ContextType, RequireFields<QuerymanifestUpdatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaRegistered?: Resolver<Maybe<ResolversTypes['SchemaRegistered']>, ParentType, ContextType, RequireFields<QueryschemaRegisteredArgs, 'id' | 'subgraphError'>>;
  schemaRegistereds?: Resolver<Array<ResolversTypes['SchemaRegistered']>, ParentType, ContextType, RequireFields<QueryschemaRegisteredsArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaUpdated?: Resolver<Maybe<ResolversTypes['SchemaUpdated']>, ParentType, ContextType, RequireFields<QueryschemaUpdatedArgs, 'id' | 'subgraphError'>>;
  schemaUpdateds?: Resolver<Array<ResolversTypes['SchemaUpdated']>, ParentType, ContextType, RequireFields<QueryschemaUpdatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  resourceCreated?: Resolver<Maybe<ResolversTypes['ResourceCreated']>, ParentType, ContextType, RequireFields<QueryresourceCreatedArgs, 'id' | 'subgraphError'>>;
  resourceCreateds?: Resolver<Array<ResolversTypes['ResourceCreated']>, ParentType, ContextType, RequireFields<QueryresourceCreatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  priceUpdated?: Resolver<Maybe<ResolversTypes['PriceUpdated']>, ParentType, ContextType, RequireFields<QuerypriceUpdatedArgs, 'id' | 'subgraphError'>>;
  priceUpdateds?: Resolver<Array<ResolversTypes['PriceUpdated']>, ParentType, ContextType, RequireFields<QuerypriceUpdatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaState?: Resolver<Maybe<ResolversTypes['SchemaState']>, ParentType, ContextType, RequireFields<QueryschemaStateArgs, 'id' | 'subgraphError'>>;
  schemaStates?: Resolver<Array<ResolversTypes['SchemaState']>, ParentType, ContextType, RequireFields<QueryschemaStatesArgs, 'skip' | 'first' | 'subgraphError'>>;
  schema?: Resolver<Maybe<ResolversTypes['Schema']>, ParentType, ContextType, RequireFields<QueryschemaArgs, 'id' | 'subgraphError'>>;
  schemas?: Resolver<Array<ResolversTypes['Schema']>, ParentType, ContextType, RequireFields<QueryschemasArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaField?: Resolver<Maybe<ResolversTypes['SchemaField']>, ParentType, ContextType, RequireFields<QueryschemaFieldArgs, 'id' | 'subgraphError'>>;
  schemaFields?: Resolver<Array<ResolversTypes['SchemaField']>, ParentType, ContextType, RequireFields<QueryschemaFieldsArgs, 'skip' | 'first' | 'subgraphError'>>;
  manifestState?: Resolver<Maybe<ResolversTypes['ManifestState']>, ParentType, ContextType, RequireFields<QuerymanifestStateArgs, 'id' | 'subgraphError'>>;
  manifestStates?: Resolver<Array<ResolversTypes['ManifestState']>, ParentType, ContextType, RequireFields<QuerymanifestStatesArgs, 'skip' | 'first' | 'subgraphError'>>;
  manifest?: Resolver<Maybe<ResolversTypes['Manifest']>, ParentType, ContextType, RequireFields<QuerymanifestArgs, 'id' | 'subgraphError'>>;
  manifests?: Resolver<Array<ResolversTypes['Manifest']>, ParentType, ContextType, RequireFields<QuerymanifestsArgs, 'skip' | 'first' | 'subgraphError'>>;
  file?: Resolver<Maybe<ResolversTypes['File']>, ParentType, ContextType, RequireFields<QueryfileArgs, 'id' | 'subgraphError'>>;
  files?: Resolver<Array<ResolversTypes['File']>, ParentType, ContextType, RequireFields<QueryfilesArgs, 'skip' | 'first' | 'subgraphError'>>;
  fileField?: Resolver<Maybe<ResolversTypes['FileField']>, ParentType, ContextType, RequireFields<QueryfileFieldArgs, 'id' | 'subgraphError'>>;
  fileFields?: Resolver<Array<ResolversTypes['FileField']>, ParentType, ContextType, RequireFields<QueryfileFieldsArgs, 'skip' | 'first' | 'subgraphError'>>;
  pricingResource?: Resolver<Maybe<ResolversTypes['PricingResource']>, ParentType, ContextType, RequireFields<QuerypricingResourceArgs, 'id' | 'subgraphError'>>;
  pricingResources?: Resolver<Array<ResolversTypes['PricingResource']>, ParentType, ContextType, RequireFields<QuerypricingResourcesArgs, 'skip' | 'first' | 'subgraphError'>>;
  _meta?: Resolver<Maybe<ResolversTypes['_Meta_']>, ParentType, ContextType, Partial<Query_metaArgs>>;
}>;

export type ResourceCreatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ResourceCreated'] = ResolversParentTypes['ResourceCreated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  resourceId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  groupId?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  price?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Schema'] = ResolversParentTypes['Schema']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  manifestStates?: Resolver<Maybe<Array<ResolversTypes['ManifestState']>>, ParentType, ContextType, RequireFields<SchemamanifestStatesArgs, 'skip' | 'first'>>;
  version?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  agentId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fields?: Resolver<Maybe<Array<ResolversTypes['SchemaField']>>, ParentType, ContextType, RequireFields<SchemafieldsArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaFieldResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaField'] = ResolversParentTypes['SchemaField']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fieldType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaRegisteredResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaRegistered'] = ResolversParentTypes['SchemaRegistered']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ipfsCid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  agentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaStateResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaState'] = ResolversParentTypes['SchemaState']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  versions?: Resolver<Maybe<Array<ResolversTypes['Schema']>>, ParentType, ContextType, RequireFields<SchemaStateversionsArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaUpdatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaUpdated'] = ResolversParentTypes['SchemaUpdated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  newIpfsCid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  newAgentId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface TimestampScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Timestamp'], any> {
  name: 'Timestamp';
}

export type _Block_Resolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['_Block_'] = ResolversParentTypes['_Block_']> = ResolversObject<{
  hash?: Resolver<Maybe<ResolversTypes['Bytes']>, ParentType, ContextType>;
  number?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  timestamp?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  parentHash?: Resolver<Maybe<ResolversTypes['Bytes']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type _Meta_Resolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['_Meta_'] = ResolversParentTypes['_Meta_']> = ResolversObject<{
  block?: Resolver<ResolversTypes['_Block_'], ParentType, ContextType>;
  deployment?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  hasIndexingErrors?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type Resolvers<ContextType = MeshContext> = ResolversObject<{
  BigDecimal?: GraphQLScalarType;
  BigInt?: GraphQLScalarType;
  Bytes?: GraphQLScalarType;
  File?: FileResolvers<ContextType>;
  FileField?: FileFieldResolvers<ContextType>;
  Int8?: GraphQLScalarType;
  Manifest?: ManifestResolvers<ContextType>;
  ManifestPublished?: ManifestPublishedResolvers<ContextType>;
  ManifestState?: ManifestStateResolvers<ContextType>;
  ManifestUpdated?: ManifestUpdatedResolvers<ContextType>;
  PriceUpdated?: PriceUpdatedResolvers<ContextType>;
  PricingResource?: PricingResourceResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  ResourceCreated?: ResourceCreatedResolvers<ContextType>;
  Schema?: SchemaResolvers<ContextType>;
  SchemaField?: SchemaFieldResolvers<ContextType>;
  SchemaRegistered?: SchemaRegisteredResolvers<ContextType>;
  SchemaState?: SchemaStateResolvers<ContextType>;
  SchemaUpdated?: SchemaUpdatedResolvers<ContextType>;
  Timestamp?: GraphQLScalarType;
  _Block_?: _Block_Resolvers<ContextType>;
  _Meta_?: _Meta_Resolvers<ContextType>;
}>;

export type DirectiveResolvers<ContextType = MeshContext> = ResolversObject<{
  entity?: entityDirectiveResolver<any, any, ContextType>;
  subgraphId?: subgraphIdDirectiveResolver<any, any, ContextType>;
  derivedFrom?: derivedFromDirectiveResolver<any, any, ContextType>;
}>;

export type MeshContext = FangornMusicTypes.Context & BaseMeshContext;


const baseDir = pathModule.join(typeof __dirname === 'string' ? __dirname : '/', '..');

const importFn: ImportFn = <T>(moduleId: string) => {
  const relativeModuleId = (pathModule.isAbsolute(moduleId) ? pathModule.relative(baseDir, moduleId) : moduleId).split('\\').join('/').replace(baseDir + '/', '');
  switch(relativeModuleId) {
    case ".graphclient/sources/FangornMusic/introspectionSchema":
      return Promise.resolve(importedModule$0) as T;
    
    default:
      return Promise.reject(new Error(`Cannot find module '${relativeModuleId}'.`));
  }
};

const rootStore = new MeshStore('.graphclient', new FsStoreStorageAdapter({
  cwd: baseDir,
  importFn,
  fileType: "ts",
}), {
  readonly: true,
  validate: false
});

export const rawServeConfig: YamlConfig.Config['serve'] = undefined as any
export async function getMeshOptions(): Promise<GetMeshOptions> {
const pubsub = new PubSub();
const sourcesStore = rootStore.child('sources');
const logger = new DefaultLogger("GraphClient");
const cache = new (MeshCache as any)({
      ...({} as any),
      importFn,
      store: rootStore.child('cache'),
      pubsub,
      logger,
    } as any)

const sources: MeshResolvedSource[] = [];
const transforms: MeshTransform[] = [];
const additionalEnvelopPlugins: MeshPlugin<any>[] = [];
const fangornMusicTransforms = [];
const additionalTypeDefs = [] as any[];
const fangornMusicHandler = new GraphqlHandler({
              name: "FangornMusic",
              config: {"endpoint":"https://api.studio.thegraph.com/query/1745244/fangorn-data-discovery/version/latest"},
              baseDir,
              cache,
              pubsub,
              store: sourcesStore.child("FangornMusic"),
              logger: logger.child("FangornMusic"),
              importFn,
            });
sources[0] = {
          name: 'FangornMusic',
          handler: fangornMusicHandler,
          transforms: fangornMusicTransforms
        }
const additionalResolvers = [] as any[]
const merger = new(BareMerger as any)({
        cache,
        pubsub,
        logger: logger.child('bareMerger'),
        store: rootStore.child('bareMerger')
      })
const documentHashMap = {
        "993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2": GetTracksDocument,
"993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2": SearchTracksDocument,
"993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2": GetTracksByOwnerDocument,
"993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2": GetTrackDocument,
"993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2": GetTrackByOwnerAndTitleDocument
      }
additionalEnvelopPlugins.push(usePersistedOperations({
        getPersistedOperation(key) {
          return documentHashMap[key];
        },
        ...{}
      }))

  return {
    sources,
    transforms,
    additionalTypeDefs,
    additionalResolvers,
    cache,
    pubsub,
    merger,
    logger,
    additionalEnvelopPlugins,
    get documents() {
      return [
      {
        document: GetTracksDocument,
        get rawSDL() {
          return printWithCache(GetTracksDocument);
        },
        location: 'GetTracksDocument.graphql',
        sha256Hash: '993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2'
      },{
        document: SearchTracksDocument,
        get rawSDL() {
          return printWithCache(SearchTracksDocument);
        },
        location: 'SearchTracksDocument.graphql',
        sha256Hash: '993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2'
      },{
        document: GetTracksByOwnerDocument,
        get rawSDL() {
          return printWithCache(GetTracksByOwnerDocument);
        },
        location: 'GetTracksByOwnerDocument.graphql',
        sha256Hash: '993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2'
      },{
        document: GetTrackDocument,
        get rawSDL() {
          return printWithCache(GetTrackDocument);
        },
        location: 'GetTrackDocument.graphql',
        sha256Hash: '993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2'
      },{
        document: GetTrackByOwnerAndTitleDocument,
        get rawSDL() {
          return printWithCache(GetTrackByOwnerAndTitleDocument);
        },
        location: 'GetTrackByOwnerAndTitleDocument.graphql',
        sha256Hash: '993adf13c1e937751f4fc42ab706ed7236970d978126c7200ce6b8528ab8ddd2'
      }
    ];
    },
    fetchFn,
  };
}

export function createBuiltMeshHTTPHandler<TServerContext = {}>(): MeshHTTPHandler<TServerContext> {
  return createMeshHTTPHandler<TServerContext>({
    baseDir,
    getBuiltMesh: getBuiltGraphClient,
    rawServeConfig: undefined,
  })
}


let meshInstance$: Promise<MeshInstance> | undefined;

export const pollingInterval = null;

export function getBuiltGraphClient(): Promise<MeshInstance> {
  if (meshInstance$ == null) {
    if (pollingInterval) {
      setInterval(() => {
        getMeshOptions()
        .then(meshOptions => getMesh(meshOptions))
        .then(newMesh =>
          meshInstance$.then(oldMesh => {
            oldMesh.destroy()
            meshInstance$ = Promise.resolve(newMesh)
          })
        ).catch(err => {
          console.error("Mesh polling failed so the existing version will be used:", err);
        });
      }, pollingInterval)
    }
    meshInstance$ = getMeshOptions().then(meshOptions => getMesh(meshOptions)).then(mesh => {
      const id = mesh.pubsub.subscribe('destroy', () => {
        meshInstance$ = undefined;
        mesh.pubsub.unsubscribe(id);
      });
      return mesh;
    });
  }
  return meshInstance$;
}

export const execute: ExecuteMeshFn = (...args) => getBuiltGraphClient().then(({ execute }) => execute(...args));

export const subscribe: SubscribeMeshFn = (...args) => getBuiltGraphClient().then(({ subscribe }) => subscribe(...args));
export function getBuiltGraphSDK<TGlobalContext = any, TOperationContext = any>(globalContext?: TGlobalContext) {
  const sdkRequester$ = getBuiltGraphClient().then(({ sdkRequesterFactory }) => sdkRequesterFactory(globalContext));
  return getSdk<TOperationContext, TGlobalContext>((...args) => sdkRequester$.then(sdkRequester => sdkRequester(...args)));
}
export type TrackFieldsFragment = Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>;

export type GetTracksQueryVariables = Exact<{
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksQuery = { manifestStates: Array<(
    Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>
    & { manifest?: Maybe<{ files?: Maybe<Array<(
        Pick<File, 'name'>
        & { fileFields?: Maybe<Array<(
          Pick<FileField, 'name' | 'value' | 'atType' | 'acc'>
          & { pricing?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }
      )>> }> }
  )> };

export type SearchTracksQueryVariables = Exact<{
  search: Scalars['String']['input'];
}>;


export type SearchTracksQuery = { manifestStates: Array<(
    Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>
    & { manifest?: Maybe<{ files?: Maybe<Array<(
        Pick<File, 'name'>
        & { fileFields?: Maybe<Array<(
          Pick<FileField, 'name' | 'value' | 'atType' | 'acc'>
          & { pricing?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }
      )>> }> }
  )> };

export type GetTracksByOwnerQueryVariables = Exact<{
  owner: Scalars['Bytes']['input'];
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksByOwnerQuery = { manifestStates: Array<(
    Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>
    & { manifest?: Maybe<{ files?: Maybe<Array<(
        Pick<File, 'name'>
        & { fileFields?: Maybe<Array<(
          Pick<FileField, 'name' | 'value' | 'atType' | 'acc'>
          & { pricing?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }
      )>> }> }
  )> };

export type GetTrackQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type GetTrackQuery = { manifestState?: Maybe<(
    Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>
    & { manifest?: Maybe<{ files?: Maybe<Array<(
        Pick<File, 'name'>
        & { fileFields?: Maybe<Array<(
          Pick<FileField, 'name' | 'value' | 'atType' | 'acc'>
          & { pricing?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }
      )>> }> }
  )> };

export type GetTrackByOwnerAndTitleQueryVariables = Exact<{
  owner: Scalars['Bytes']['input'];
  title: Scalars['String']['input'];
}>;


export type GetTrackByOwnerAndTitleQuery = { manifestStates: Array<(
    Pick<ManifestState, 'id' | 'owner' | 'schemaId' | 'schemaName' | 'manifestCid' | 'version' | 'lastUpdated'>
    & { manifest?: Maybe<{ files?: Maybe<Array<(
        Pick<File, 'name'>
        & { fileFields?: Maybe<Array<Pick<FileField, 'name' | 'value'>>> }
      )>> }> }
  )> };

export const TrackFieldsFragmentDoc = gql`
    fragment TrackFields on ManifestState {
  id
  owner
  schemaId
  schemaName
  manifestCid
  version
  lastUpdated
}
    ` as unknown as DocumentNode<TrackFieldsFragment, unknown>;
export const GetTracksDocument = gql`
    query GetTracks($first: Int!, $skip: Int!) {
  manifestStates(
    first: $first
    skip: $skip
    orderBy: lastUpdated
    orderDirection: desc
    where: {schemaId: "0x7a69b1c49f16834707fe1d8bcc69ec485ea1b3c7bc68dd3ab81b05ec539952cd"}
  ) {
    ...TrackFields
    manifest {
      files {
        name
        fileFields {
          name
          value
          atType
          acc
          pricing {
            price
            currency
          }
        }
      }
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksQuery, GetTracksQueryVariables>;
export const SearchTracksDocument = gql`
    query SearchTracks($search: String!) {
  manifestStates(
    where: {schemaId: "0x7a69b1c49f16834707fe1d8bcc69ec485ea1b3c7bc68dd3ab81b05ec539952cd"}
    first: 100
  ) {
    ...TrackFields
    manifest {
      files {
        name
        fileFields {
          name
          value
          atType
          acc
          pricing {
            price
            currency
          }
        }
      }
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<SearchTracksQuery, SearchTracksQueryVariables>;
export const GetTracksByOwnerDocument = gql`
    query GetTracksByOwner($owner: Bytes!, $first: Int!, $skip: Int!) {
  manifestStates(
    where: {owner: $owner, schemaId: "0x7a69b1c49f16834707fe1d8bcc69ec485ea1b3c7bc68dd3ab81b05ec539952cd"}
    first: $first
    skip: $skip
  ) {
    ...TrackFields
    manifest {
      files {
        name
        fileFields {
          name
          value
          atType
          acc
          pricing {
            price
            currency
          }
        }
      }
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksByOwnerQuery, GetTracksByOwnerQueryVariables>;
export const GetTrackDocument = gql`
    query GetTrack($id: ID!) {
  manifestState(id: $id) {
    ...TrackFields
    manifest {
      files {
        name
        fileFields {
          name
          value
          atType
          acc
          pricing {
            price
            currency
          }
        }
      }
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTrackQuery, GetTrackQueryVariables>;
export const GetTrackByOwnerAndTitleDocument = gql`
    query GetTrackByOwnerAndTitle($owner: Bytes!, $title: String!) {
  manifestStates(
    where: {owner: $owner, schemaId: "0x7a69b1c49f16834707fe1d8bcc69ec485ea1b3c7bc68dd3ab81b05ec539952cd"}
    first: 10
  ) {
    ...TrackFields
    manifest {
      files {
        name
        fileFields {
          name
          value
        }
      }
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTrackByOwnerAndTitleQuery, GetTrackByOwnerAndTitleQueryVariables>;






export type Requester<C = {}, E = unknown> = <R, V>(doc: DocumentNode, vars?: V, options?: C) => Promise<R> | AsyncIterable<R>
export function getSdk<C, E>(requester: Requester<C, E>) {
  return {
    GetTracks(variables: GetTracksQueryVariables, options?: C): Promise<GetTracksQuery> {
      return requester<GetTracksQuery, GetTracksQueryVariables>(GetTracksDocument, variables, options) as Promise<GetTracksQuery>;
    },
    SearchTracks(variables: SearchTracksQueryVariables, options?: C): Promise<SearchTracksQuery> {
      return requester<SearchTracksQuery, SearchTracksQueryVariables>(SearchTracksDocument, variables, options) as Promise<SearchTracksQuery>;
    },
    GetTracksByOwner(variables: GetTracksByOwnerQueryVariables, options?: C): Promise<GetTracksByOwnerQuery> {
      return requester<GetTracksByOwnerQuery, GetTracksByOwnerQueryVariables>(GetTracksByOwnerDocument, variables, options) as Promise<GetTracksByOwnerQuery>;
    },
    GetTrack(variables: GetTrackQueryVariables, options?: C): Promise<GetTrackQuery> {
      return requester<GetTrackQuery, GetTrackQueryVariables>(GetTrackDocument, variables, options) as Promise<GetTrackQuery>;
    },
    GetTrackByOwnerAndTitle(variables: GetTrackByOwnerAndTitleQueryVariables, options?: C): Promise<GetTrackByOwnerAndTitleQuery> {
      return requester<GetTrackByOwnerAndTitleQuery, GetTrackByOwnerAndTitleQueryVariables>(GetTrackByOwnerAndTitleDocument, variables, options) as Promise<GetTrackByOwnerAndTitleQuery>;
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;