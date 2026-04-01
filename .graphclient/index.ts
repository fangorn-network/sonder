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

export type Field = {
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
  atType?: Maybe<Scalars['String']['output']>;
  acc?: Maybe<Scalars['String']['output']>;
  manifestState: ManifestState;
  fileEntry?: Maybe<FileEntry>;
  price?: Maybe<PricingResource>;
};

export type Field_filter = {
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
  fileEntry?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not?: InputMaybe<Scalars['String']['input']>;
  fileEntry_gt?: InputMaybe<Scalars['String']['input']>;
  fileEntry_lt?: InputMaybe<Scalars['String']['input']>;
  fileEntry_gte?: InputMaybe<Scalars['String']['input']>;
  fileEntry_lte?: InputMaybe<Scalars['String']['input']>;
  fileEntry_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fileEntry_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  fileEntry_contains?: InputMaybe<Scalars['String']['input']>;
  fileEntry_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_contains?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_starts_with?: InputMaybe<Scalars['String']['input']>;
  fileEntry_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_ends_with?: InputMaybe<Scalars['String']['input']>;
  fileEntry_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  fileEntry_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fileEntry_?: InputMaybe<FileEntry_filter>;
  price?: InputMaybe<Scalars['String']['input']>;
  price_not?: InputMaybe<Scalars['String']['input']>;
  price_gt?: InputMaybe<Scalars['String']['input']>;
  price_lt?: InputMaybe<Scalars['String']['input']>;
  price_gte?: InputMaybe<Scalars['String']['input']>;
  price_lte?: InputMaybe<Scalars['String']['input']>;
  price_in?: InputMaybe<Array<Scalars['String']['input']>>;
  price_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  price_contains?: InputMaybe<Scalars['String']['input']>;
  price_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  price_not_contains?: InputMaybe<Scalars['String']['input']>;
  price_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  price_starts_with?: InputMaybe<Scalars['String']['input']>;
  price_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  price_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  price_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  price_ends_with?: InputMaybe<Scalars['String']['input']>;
  price_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  price_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  price_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  price_?: InputMaybe<PricingResource_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Field_filter>>>;
  or?: InputMaybe<Array<InputMaybe<Field_filter>>>;
};

export type Field_orderBy =
  | 'id'
  | 'name'
  | 'value'
  | 'atType'
  | 'acc'
  | 'manifestState'
  | 'manifestState__id'
  | 'manifestState__owner'
  | 'manifestState__schema_id'
  | 'manifestState__schema_name'
  | 'manifestState__manifest_cid'
  | 'manifestState__version'
  | 'manifestState__lastUpdated'
  | 'fileEntry'
  | 'fileEntry__id'
  | 'fileEntry__tag'
  | 'price'
  | 'price__id'
  | 'price__owner'
  | 'price__price'
  | 'price__currency';

export type FileEntry = {
  id: Scalars['ID']['output'];
  tag?: Maybe<Scalars['String']['output']>;
  manifest?: Maybe<Manifest>;
  fields?: Maybe<Array<Field>>;
};


export type FileEntryfieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Field_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<Field_filter>;
};

export type FileEntry_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  tag?: InputMaybe<Scalars['String']['input']>;
  tag_not?: InputMaybe<Scalars['String']['input']>;
  tag_gt?: InputMaybe<Scalars['String']['input']>;
  tag_lt?: InputMaybe<Scalars['String']['input']>;
  tag_gte?: InputMaybe<Scalars['String']['input']>;
  tag_lte?: InputMaybe<Scalars['String']['input']>;
  tag_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tag_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tag_contains?: InputMaybe<Scalars['String']['input']>;
  tag_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  tag_not_contains?: InputMaybe<Scalars['String']['input']>;
  tag_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  tag_starts_with?: InputMaybe<Scalars['String']['input']>;
  tag_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  tag_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  tag_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  tag_ends_with?: InputMaybe<Scalars['String']['input']>;
  tag_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  tag_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  tag_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
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
  fields?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_?: InputMaybe<Field_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<FileEntry_filter>>>;
  or?: InputMaybe<Array<InputMaybe<FileEntry_filter>>>;
};

export type FileEntry_orderBy =
  | 'id'
  | 'tag'
  | 'manifest'
  | 'manifest__id'
  | 'manifest__manifestVersion'
  | 'manifest__schemaId'
  | 'fields';

export type Manifest = {
  id: Scalars['ID']['output'];
  manifestVersion?: Maybe<Scalars['BigInt']['output']>;
  schemaId?: Maybe<Scalars['String']['output']>;
  files?: Maybe<Array<FileEntry>>;
};


export type ManifestfilesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<FileEntry_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<FileEntry_filter>;
};

export type ManifestPublished = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schema_id: Scalars['Bytes']['output'];
  manifest_cid: Scalars['String']['output'];
  version: Scalars['BigInt']['output'];
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
  schema_id?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifest_cid?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
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
  and?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
};

export type ManifestPublished_orderBy =
  | 'id'
  | 'owner'
  | 'schema_id'
  | 'manifest_cid'
  | 'version'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'transactionHash';

export type ManifestState = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schema_id: Scalars['Bytes']['output'];
  schema?: Maybe<Schema>;
  schema_name: Scalars['String']['output'];
  manifest_cid: Scalars['String']['output'];
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
  schema_id?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
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
  schema_name?: InputMaybe<Scalars['String']['input']>;
  schema_name_not?: InputMaybe<Scalars['String']['input']>;
  schema_name_gt?: InputMaybe<Scalars['String']['input']>;
  schema_name_lt?: InputMaybe<Scalars['String']['input']>;
  schema_name_gte?: InputMaybe<Scalars['String']['input']>;
  schema_name_lte?: InputMaybe<Scalars['String']['input']>;
  schema_name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schema_name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schema_name_contains?: InputMaybe<Scalars['String']['input']>;
  schema_name_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_contains?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_name_starts_with?: InputMaybe<Scalars['String']['input']>;
  schema_name_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_name_ends_with?: InputMaybe<Scalars['String']['input']>;
  schema_name_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schema_name_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
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
  | 'owner'
  | 'schema_id'
  | 'schema'
  | 'schema__id'
  | 'schema__schemaId'
  | 'schema__owner'
  | 'schema__name'
  | 'schema_name'
  | 'manifest_cid'
  | 'manifest'
  | 'manifest__id'
  | 'manifest__manifestVersion'
  | 'manifest__schemaId'
  | 'version'
  | 'lastUpdated';

export type ManifestUpdated = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schema_id: Scalars['Bytes']['output'];
  manifest_cid: Scalars['String']['output'];
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
  schema_id?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lt?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_gte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_lte?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_not_in?: InputMaybe<Array<Scalars['Bytes']['input']>>;
  schema_id_contains?: InputMaybe<Scalars['Bytes']['input']>;
  schema_id_not_contains?: InputMaybe<Scalars['Bytes']['input']>;
  manifest_cid?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lt?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_gte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_lte?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  manifest_cid_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  manifest_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
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
  | 'schema_id'
  | 'manifest_cid'
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
  manifestVersion?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_not?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_gt?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_lt?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_gte?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_lte?: InputMaybe<Scalars['BigInt']['input']>;
  manifestVersion_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  manifestVersion_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  schemaId?: InputMaybe<Scalars['String']['input']>;
  schemaId_not?: InputMaybe<Scalars['String']['input']>;
  schemaId_gt?: InputMaybe<Scalars['String']['input']>;
  schemaId_lt?: InputMaybe<Scalars['String']['input']>;
  schemaId_gte?: InputMaybe<Scalars['String']['input']>;
  schemaId_lte?: InputMaybe<Scalars['String']['input']>;
  schemaId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  schemaId_contains?: InputMaybe<Scalars['String']['input']>;
  schemaId_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_contains?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaId_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaId_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaId_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaId_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  schemaId_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  files?: InputMaybe<Array<Scalars['String']['input']>>;
  files_not?: InputMaybe<Array<Scalars['String']['input']>>;
  files_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  files_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  files_not_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  files_not_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  files_?: InputMaybe<FileEntry_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Manifest_filter>>>;
  or?: InputMaybe<Array<InputMaybe<Manifest_filter>>>;
};

export type Manifest_orderBy =
  | 'id'
  | 'manifestVersion'
  | 'schemaId'
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
  resourceCreated?: Maybe<ResourceCreated>;
  resourceCreateds: Array<ResourceCreated>;
  priceUpdated?: Maybe<PriceUpdated>;
  priceUpdateds: Array<PriceUpdated>;
  schemaUpdated?: Maybe<SchemaUpdated>;
  schemaUpdateds: Array<SchemaUpdated>;
  schema?: Maybe<Schema>;
  schemas: Array<Schema>;
  schemaEntries?: Maybe<SchemaEntries>;
  schemaEntries_collection: Array<SchemaEntries>;
  schemaField?: Maybe<SchemaField>;
  schemaFields: Array<SchemaField>;
  manifestState?: Maybe<ManifestState>;
  manifestStates: Array<ManifestState>;
  manifest?: Maybe<Manifest>;
  manifests: Array<Manifest>;
  fileEntry?: Maybe<FileEntry>;
  fileEntries: Array<FileEntry>;
  field?: Maybe<Field>;
  fields: Array<Field>;
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


export type QueryschemaEntriesArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryschemaEntries_collectionArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaEntries_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaEntries_filter>;
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


export type QueryfileEntryArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfileEntriesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<FileEntry_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<FileEntry_filter>;
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfieldArgs = {
  id: Scalars['ID']['input'];
  block?: InputMaybe<Block_height>;
  subgraphError?: _SubgraphErrorPolicy_;
};


export type QueryfieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Field_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<Field_filter>;
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
  schemaId: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  name: Scalars['String']['output'];
  versions?: Maybe<Array<SchemaEntries>>;
  manifestStates?: Maybe<Array<ManifestState>>;
};


export type SchemaversionsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaEntries_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaEntries_filter>;
};


export type SchemamanifestStatesArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<ManifestState_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<ManifestState_filter>;
};

export type SchemaEntries = {
  id: Scalars['ID']['output'];
  version: Scalars['BigInt']['output'];
  spec_cid: Scalars['String']['output'];
  agent_id?: Maybe<Scalars['String']['output']>;
  fields?: Maybe<Array<SchemaField>>;
};


export type SchemaEntriesfieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<SchemaField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<SchemaField_filter>;
};

export type SchemaEntries_filter = {
  id?: InputMaybe<Scalars['ID']['input']>;
  id_not?: InputMaybe<Scalars['ID']['input']>;
  id_gt?: InputMaybe<Scalars['ID']['input']>;
  id_lt?: InputMaybe<Scalars['ID']['input']>;
  id_gte?: InputMaybe<Scalars['ID']['input']>;
  id_lte?: InputMaybe<Scalars['ID']['input']>;
  id_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  id_not_in?: InputMaybe<Array<Scalars['ID']['input']>>;
  version?: InputMaybe<Scalars['BigInt']['input']>;
  version_not?: InputMaybe<Scalars['BigInt']['input']>;
  version_gt?: InputMaybe<Scalars['BigInt']['input']>;
  version_lt?: InputMaybe<Scalars['BigInt']['input']>;
  version_gte?: InputMaybe<Scalars['BigInt']['input']>;
  version_lte?: InputMaybe<Scalars['BigInt']['input']>;
  version_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  version_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  spec_cid?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not?: InputMaybe<Scalars['String']['input']>;
  spec_cid_gt?: InputMaybe<Scalars['String']['input']>;
  spec_cid_lt?: InputMaybe<Scalars['String']['input']>;
  spec_cid_gte?: InputMaybe<Scalars['String']['input']>;
  spec_cid_lte?: InputMaybe<Scalars['String']['input']>;
  spec_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  spec_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  spec_cid_contains?: InputMaybe<Scalars['String']['input']>;
  spec_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id?: InputMaybe<Scalars['String']['input']>;
  agent_id_not?: InputMaybe<Scalars['String']['input']>;
  agent_id_gt?: InputMaybe<Scalars['String']['input']>;
  agent_id_lt?: InputMaybe<Scalars['String']['input']>;
  agent_id_gte?: InputMaybe<Scalars['String']['input']>;
  agent_id_lte?: InputMaybe<Scalars['String']['input']>;
  agent_id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agent_id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agent_id_contains?: InputMaybe<Scalars['String']['input']>;
  agent_id_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_contains?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_starts_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_ends_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  fields?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_not_contains_nocase?: InputMaybe<Array<Scalars['String']['input']>>;
  fields_?: InputMaybe<SchemaField_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaEntries_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaEntries_filter>>>;
};

export type SchemaEntries_orderBy =
  | 'id'
  | 'version'
  | 'spec_cid'
  | 'agent_id'
  | 'fields';

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
  spec_cid: Scalars['String']['output'];
  agent_id: Scalars['String']['output'];
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
  spec_cid?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not?: InputMaybe<Scalars['String']['input']>;
  spec_cid_gt?: InputMaybe<Scalars['String']['input']>;
  spec_cid_lt?: InputMaybe<Scalars['String']['input']>;
  spec_cid_gte?: InputMaybe<Scalars['String']['input']>;
  spec_cid_lte?: InputMaybe<Scalars['String']['input']>;
  spec_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  spec_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  spec_cid_contains?: InputMaybe<Scalars['String']['input']>;
  spec_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  spec_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id?: InputMaybe<Scalars['String']['input']>;
  agent_id_not?: InputMaybe<Scalars['String']['input']>;
  agent_id_gt?: InputMaybe<Scalars['String']['input']>;
  agent_id_lt?: InputMaybe<Scalars['String']['input']>;
  agent_id_gte?: InputMaybe<Scalars['String']['input']>;
  agent_id_lte?: InputMaybe<Scalars['String']['input']>;
  agent_id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agent_id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  agent_id_contains?: InputMaybe<Scalars['String']['input']>;
  agent_id_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_contains?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_starts_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_ends_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  agent_id_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
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
  | 'spec_cid'
  | 'agent_id';

export type SchemaUpdated = {
  id: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  new_spec_cid: Scalars['String']['output'];
  new_agent_id: Scalars['String']['output'];
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
  new_spec_cid?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_gt?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_lt?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_gte?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_lte?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_in?: InputMaybe<Array<Scalars['String']['input']>>;
  new_spec_cid_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  new_spec_cid_contains?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_contains?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_starts_with?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_ends_with?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  new_spec_cid_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_gt?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_lt?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_gte?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_lte?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  new_agent_id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  new_agent_id_contains?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_contains?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_starts_with?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_ends_with?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  new_agent_id_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<SchemaUpdated_filter>>>;
  or?: InputMaybe<Array<InputMaybe<SchemaUpdated_filter>>>;
};

export type SchemaUpdated_orderBy =
  | 'id'
  | 'schemaId'
  | 'new_spec_cid'
  | 'new_agent_id';

export type Schema_filter = {
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
  versions_?: InputMaybe<SchemaEntries_filter>;
  manifestStates_?: InputMaybe<ManifestState_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<Schema_filter>>>;
  or?: InputMaybe<Array<InputMaybe<Schema_filter>>>;
};

export type Schema_orderBy =
  | 'id'
  | 'schemaId'
  | 'owner'
  | 'name'
  | 'versions'
  | 'manifestStates';

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
  Field: ResolverTypeWrapper<Field>;
  Field_filter: Field_filter;
  Field_orderBy: Field_orderBy;
  FileEntry: ResolverTypeWrapper<FileEntry>;
  FileEntry_filter: FileEntry_filter;
  FileEntry_orderBy: FileEntry_orderBy;
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
  SchemaEntries: ResolverTypeWrapper<SchemaEntries>;
  SchemaEntries_filter: SchemaEntries_filter;
  SchemaEntries_orderBy: SchemaEntries_orderBy;
  SchemaField: ResolverTypeWrapper<SchemaField>;
  SchemaField_filter: SchemaField_filter;
  SchemaField_orderBy: SchemaField_orderBy;
  SchemaRegistered: ResolverTypeWrapper<SchemaRegistered>;
  SchemaRegistered_filter: SchemaRegistered_filter;
  SchemaRegistered_orderBy: SchemaRegistered_orderBy;
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
  Field: Field;
  Field_filter: Field_filter;
  FileEntry: FileEntry;
  FileEntry_filter: FileEntry_filter;
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
  SchemaEntries: SchemaEntries;
  SchemaEntries_filter: SchemaEntries_filter;
  SchemaField: SchemaField;
  SchemaField_filter: SchemaField_filter;
  SchemaRegistered: SchemaRegistered;
  SchemaRegistered_filter: SchemaRegistered_filter;
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

export type FieldResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Field'] = ResolversParentTypes['Field']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  value?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  atType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  acc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  manifestState?: Resolver<ResolversTypes['ManifestState'], ParentType, ContextType>;
  fileEntry?: Resolver<Maybe<ResolversTypes['FileEntry']>, ParentType, ContextType>;
  price?: Resolver<Maybe<ResolversTypes['PricingResource']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type FileEntryResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['FileEntry'] = ResolversParentTypes['FileEntry']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  tag?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  manifest?: Resolver<Maybe<ResolversTypes['Manifest']>, ParentType, ContextType>;
  fields?: Resolver<Maybe<Array<ResolversTypes['Field']>>, ParentType, ContextType, RequireFields<FileEntryfieldsArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export interface Int8ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Int8'], any> {
  name: 'Int8';
}

export type ManifestResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['Manifest'] = ResolversParentTypes['Manifest']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  manifestVersion?: Resolver<Maybe<ResolversTypes['BigInt']>, ParentType, ContextType>;
  schemaId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  files?: Resolver<Maybe<Array<ResolversTypes['FileEntry']>>, ParentType, ContextType, RequireFields<ManifestfilesArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestPublishedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestPublished'] = ResolversParentTypes['ManifestPublished']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schema_id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  manifest_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  blockNumber?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  blockTimestamp?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  transactionHash?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestStateResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestState'] = ResolversParentTypes['ManifestState']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schema_id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schema?: Resolver<Maybe<ResolversTypes['Schema']>, ParentType, ContextType>;
  schema_name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifest_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  manifest?: Resolver<Maybe<ResolversTypes['Manifest']>, ParentType, ContextType>;
  version?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  lastUpdated?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type ManifestUpdatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['ManifestUpdated'] = ResolversParentTypes['ManifestUpdated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schema_id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  manifest_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  resourceCreated?: Resolver<Maybe<ResolversTypes['ResourceCreated']>, ParentType, ContextType, RequireFields<QueryresourceCreatedArgs, 'id' | 'subgraphError'>>;
  resourceCreateds?: Resolver<Array<ResolversTypes['ResourceCreated']>, ParentType, ContextType, RequireFields<QueryresourceCreatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  priceUpdated?: Resolver<Maybe<ResolversTypes['PriceUpdated']>, ParentType, ContextType, RequireFields<QuerypriceUpdatedArgs, 'id' | 'subgraphError'>>;
  priceUpdateds?: Resolver<Array<ResolversTypes['PriceUpdated']>, ParentType, ContextType, RequireFields<QuerypriceUpdatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaUpdated?: Resolver<Maybe<ResolversTypes['SchemaUpdated']>, ParentType, ContextType, RequireFields<QueryschemaUpdatedArgs, 'id' | 'subgraphError'>>;
  schemaUpdateds?: Resolver<Array<ResolversTypes['SchemaUpdated']>, ParentType, ContextType, RequireFields<QueryschemaUpdatedsArgs, 'skip' | 'first' | 'subgraphError'>>;
  schema?: Resolver<Maybe<ResolversTypes['Schema']>, ParentType, ContextType, RequireFields<QueryschemaArgs, 'id' | 'subgraphError'>>;
  schemas?: Resolver<Array<ResolversTypes['Schema']>, ParentType, ContextType, RequireFields<QueryschemasArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaEntries?: Resolver<Maybe<ResolversTypes['SchemaEntries']>, ParentType, ContextType, RequireFields<QueryschemaEntriesArgs, 'id' | 'subgraphError'>>;
  schemaEntries_collection?: Resolver<Array<ResolversTypes['SchemaEntries']>, ParentType, ContextType, RequireFields<QueryschemaEntries_collectionArgs, 'skip' | 'first' | 'subgraphError'>>;
  schemaField?: Resolver<Maybe<ResolversTypes['SchemaField']>, ParentType, ContextType, RequireFields<QueryschemaFieldArgs, 'id' | 'subgraphError'>>;
  schemaFields?: Resolver<Array<ResolversTypes['SchemaField']>, ParentType, ContextType, RequireFields<QueryschemaFieldsArgs, 'skip' | 'first' | 'subgraphError'>>;
  manifestState?: Resolver<Maybe<ResolversTypes['ManifestState']>, ParentType, ContextType, RequireFields<QuerymanifestStateArgs, 'id' | 'subgraphError'>>;
  manifestStates?: Resolver<Array<ResolversTypes['ManifestState']>, ParentType, ContextType, RequireFields<QuerymanifestStatesArgs, 'skip' | 'first' | 'subgraphError'>>;
  manifest?: Resolver<Maybe<ResolversTypes['Manifest']>, ParentType, ContextType, RequireFields<QuerymanifestArgs, 'id' | 'subgraphError'>>;
  manifests?: Resolver<Array<ResolversTypes['Manifest']>, ParentType, ContextType, RequireFields<QuerymanifestsArgs, 'skip' | 'first' | 'subgraphError'>>;
  fileEntry?: Resolver<Maybe<ResolversTypes['FileEntry']>, ParentType, ContextType, RequireFields<QueryfileEntryArgs, 'id' | 'subgraphError'>>;
  fileEntries?: Resolver<Array<ResolversTypes['FileEntry']>, ParentType, ContextType, RequireFields<QueryfileEntriesArgs, 'skip' | 'first' | 'subgraphError'>>;
  field?: Resolver<Maybe<ResolversTypes['Field']>, ParentType, ContextType, RequireFields<QueryfieldArgs, 'id' | 'subgraphError'>>;
  fields?: Resolver<Array<ResolversTypes['Field']>, ParentType, ContextType, RequireFields<QueryfieldsArgs, 'skip' | 'first' | 'subgraphError'>>;
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
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  owner?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  versions?: Resolver<Maybe<Array<ResolversTypes['SchemaEntries']>>, ParentType, ContextType, RequireFields<SchemaversionsArgs, 'skip' | 'first'>>;
  manifestStates?: Resolver<Maybe<Array<ResolversTypes['ManifestState']>>, ParentType, ContextType, RequireFields<SchemamanifestStatesArgs, 'skip' | 'first'>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaEntriesResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaEntries'] = ResolversParentTypes['SchemaEntries']> = ResolversObject<{
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  version?: Resolver<ResolversTypes['BigInt'], ParentType, ContextType>;
  spec_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  agent_id?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fields?: Resolver<Maybe<Array<ResolversTypes['SchemaField']>>, ParentType, ContextType, RequireFields<SchemaEntriesfieldsArgs, 'skip' | 'first'>>;
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
  spec_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  agent_id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
}>;

export type SchemaUpdatedResolvers<ContextType = MeshContext, ParentType extends ResolversParentTypes['SchemaUpdated'] = ResolversParentTypes['SchemaUpdated']> = ResolversObject<{
  id?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  schemaId?: Resolver<ResolversTypes['Bytes'], ParentType, ContextType>;
  new_spec_cid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  new_agent_id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  Field?: FieldResolvers<ContextType>;
  FileEntry?: FileEntryResolvers<ContextType>;
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
  SchemaEntries?: SchemaEntriesResolvers<ContextType>;
  SchemaField?: SchemaFieldResolvers<ContextType>;
  SchemaRegistered?: SchemaRegisteredResolvers<ContextType>;
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
        "c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetTracksDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": SearchTracksDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetTracksByArtistDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetAlbumTracksDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetTracksByGenreDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetTracksByOwnerDocument,
"c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f": GetTrackDocument
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
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: SearchTracksDocument,
        get rawSDL() {
          return printWithCache(SearchTracksDocument);
        },
        location: 'SearchTracksDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: GetTracksByArtistDocument,
        get rawSDL() {
          return printWithCache(GetTracksByArtistDocument);
        },
        location: 'GetTracksByArtistDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: GetAlbumTracksDocument,
        get rawSDL() {
          return printWithCache(GetAlbumTracksDocument);
        },
        location: 'GetAlbumTracksDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: GetTracksByGenreDocument,
        get rawSDL() {
          return printWithCache(GetTracksByGenreDocument);
        },
        location: 'GetTracksByGenreDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: GetTracksByOwnerDocument,
        get rawSDL() {
          return printWithCache(GetTracksByOwnerDocument);
        },
        location: 'GetTracksByOwnerDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
      },{
        document: GetTrackDocument,
        get rawSDL() {
          return printWithCache(GetTrackDocument);
        },
        location: 'GetTrackDocument.graphql',
        sha256Hash: 'c4de5bf52233dc397b99dd392ec2ab190896f29dd9909b3b5f1ee61d4c359d8f'
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
export type TrackFieldsFragment = (
  Pick<ManifestState, 'owner' | 'schema_name'>
  & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
        Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
        & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
      )>> }>> }> }
);

export type GetTracksQueryVariables = Exact<{
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksQuery = { manifestStates: Array<(
    Pick<ManifestState, 'owner' | 'schema_name'>
    & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
          Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
          & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }>> }> }
  )> };

export type SearchTracksQueryVariables = Exact<{
  search: Scalars['String']['input'];
}>;


export type SearchTracksQuery = { byArtist: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }>, byTitle: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }>, byAlbum: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }>, byGenre: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }> };

export type GetTracksByArtistQueryVariables = Exact<{
  artist: Scalars['String']['input'];
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksByArtistQuery = { fields: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }> };

export type GetAlbumTracksQueryVariables = Exact<{
  album: Scalars['String']['input'];
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetAlbumTracksQuery = { fields: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }> };

export type GetTracksByGenreQueryVariables = Exact<{
  genre: Scalars['String']['input'];
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksByGenreQuery = { fields: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }> };

export type GetTracksByOwnerQueryVariables = Exact<{
  owner: Scalars['Bytes']['input'];
  first: Scalars['Int']['input'];
  skip: Scalars['Int']['input'];
}>;


export type GetTracksByOwnerQuery = { manifestStates: Array<(
    Pick<ManifestState, 'owner' | 'schema_name'>
    & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
          Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
          & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
        )>> }>> }> }
  )> };

export type GetTrackQueryVariables = Exact<{
  owner: Scalars['Bytes']['input'];
  title: Scalars['String']['input'];
}>;


export type GetTrackQuery = { fields: Array<{ manifestState: (
      Pick<ManifestState, 'owner' | 'schema_name'>
      & { manifest?: Maybe<{ files?: Maybe<Array<{ fields?: Maybe<Array<(
            Pick<Field, 'name' | 'value' | 'atType' | 'acc'>
            & { price?: Maybe<Pick<PricingResource, 'price' | 'currency'>> }
          )>> }>> }> }
    ) }> };

export const TrackFieldsFragmentDoc = gql`
    fragment TrackFields on ManifestState {
  owner
  schema_name
  manifest {
    files {
      fields {
        name
        value
        atType
        acc
        price {
          price
          currency
        }
      }
    }
  }
}
    ` as unknown as DocumentNode<TrackFieldsFragment, unknown>;
export const GetTracksDocument = gql`
    query GetTracks($first: Int!, $skip: Int!) {
  manifestStates(
    first: $first
    skip: $skip
    where: {schema_name: "fangorn.music.test.v0"}
  ) {
    ...TrackFields
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksQuery, GetTracksQueryVariables>;
export const SearchTracksDocument = gql`
    query SearchTracks($search: String!) {
  byArtist: fields(
    where: {name: "artist", value_contains_nocase: $search}
    first: 50
  ) {
    manifestState {
      ...TrackFields
    }
  }
  byTitle: fields(
    where: {name: "title", value_contains_nocase: $search}
    first: 50
  ) {
    manifestState {
      ...TrackFields
    }
  }
  byAlbum: fields(
    where: {name: "album", value_contains_nocase: $search}
    first: 50
  ) {
    manifestState {
      ...TrackFields
    }
  }
  byGenre: fields(
    where: {name: "genre", value_contains_nocase: $search}
    first: 50
  ) {
    manifestState {
      ...TrackFields
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<SearchTracksQuery, SearchTracksQueryVariables>;
export const GetTracksByArtistDocument = gql`
    query GetTracksByArtist($artist: String!, $first: Int!, $skip: Int!) {
  fields(where: {name: "artist", value: $artist}, first: $first, skip: $skip) {
    manifestState {
      ...TrackFields
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksByArtistQuery, GetTracksByArtistQueryVariables>;
export const GetAlbumTracksDocument = gql`
    query GetAlbumTracks($album: String!, $first: Int!, $skip: Int!) {
  fields(where: {name: "album", value: $album}, first: $first, skip: $skip) {
    manifestState {
      ...TrackFields
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetAlbumTracksQuery, GetAlbumTracksQueryVariables>;
export const GetTracksByGenreDocument = gql`
    query GetTracksByGenre($genre: String!, $first: Int!, $skip: Int!) {
  fields(
    where: {name: "genre", value_contains_nocase: $genre}
    first: $first
    skip: $skip
  ) {
    manifestState {
      ...TrackFields
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksByGenreQuery, GetTracksByGenreQueryVariables>;
export const GetTracksByOwnerDocument = gql`
    query GetTracksByOwner($owner: Bytes!, $first: Int!, $skip: Int!) {
  manifestStates(
    where: {owner: $owner, schema_name: "pl-genesis.fangorn.music"}
    first: $first
    skip: $skip
  ) {
    ...TrackFields
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTracksByOwnerQuery, GetTracksByOwnerQueryVariables>;
export const GetTrackDocument = gql`
    query GetTrack($owner: Bytes!, $title: String!) {
  fields(where: {name: "title", value: $title}, first: 1) {
    manifestState {
      ...TrackFields
    }
  }
}
    ${TrackFieldsFragmentDoc}` as unknown as DocumentNode<GetTrackQuery, GetTrackQueryVariables>;








export type Requester<C = {}, E = unknown> = <R, V>(doc: DocumentNode, vars?: V, options?: C) => Promise<R> | AsyncIterable<R>
export function getSdk<C, E>(requester: Requester<C, E>) {
  return {
    GetTracks(variables: GetTracksQueryVariables, options?: C): Promise<GetTracksQuery> {
      return requester<GetTracksQuery, GetTracksQueryVariables>(GetTracksDocument, variables, options) as Promise<GetTracksQuery>;
    },
    SearchTracks(variables: SearchTracksQueryVariables, options?: C): Promise<SearchTracksQuery> {
      return requester<SearchTracksQuery, SearchTracksQueryVariables>(SearchTracksDocument, variables, options) as Promise<SearchTracksQuery>;
    },
    GetTracksByArtist(variables: GetTracksByArtistQueryVariables, options?: C): Promise<GetTracksByArtistQuery> {
      return requester<GetTracksByArtistQuery, GetTracksByArtistQueryVariables>(GetTracksByArtistDocument, variables, options) as Promise<GetTracksByArtistQuery>;
    },
    GetAlbumTracks(variables: GetAlbumTracksQueryVariables, options?: C): Promise<GetAlbumTracksQuery> {
      return requester<GetAlbumTracksQuery, GetAlbumTracksQueryVariables>(GetAlbumTracksDocument, variables, options) as Promise<GetAlbumTracksQuery>;
    },
    GetTracksByGenre(variables: GetTracksByGenreQueryVariables, options?: C): Promise<GetTracksByGenreQuery> {
      return requester<GetTracksByGenreQuery, GetTracksByGenreQueryVariables>(GetTracksByGenreDocument, variables, options) as Promise<GetTracksByGenreQuery>;
    },
    GetTracksByOwner(variables: GetTracksByOwnerQueryVariables, options?: C): Promise<GetTracksByOwnerQuery> {
      return requester<GetTracksByOwnerQuery, GetTracksByOwnerQueryVariables>(GetTracksByOwnerDocument, variables, options) as Promise<GetTracksByOwnerQuery>;
    },
    GetTrack(variables: GetTrackQueryVariables, options?: C): Promise<GetTrackQuery> {
      return requester<GetTrackQuery, GetTrackQueryVariables>(GetTrackDocument, variables, options) as Promise<GetTrackQuery>;
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;