// @ts-nocheck

import { InContextSdkMethod } from '@graphql-mesh/types';
import { MeshContext } from '@graphql-mesh/runtime';

export namespace FangornMusicTypes {
  export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
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
  tag?: Maybe<Scalars['String']['output']>;
  manifest?: Maybe<Manifest>;
  fields?: Maybe<Array<FileField>>;
};


export type FilefieldsArgs = {
  skip?: InputMaybe<Scalars['Int']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<FileField_orderBy>;
  orderDirection?: InputMaybe<OrderDirection>;
  where?: InputMaybe<FileField_filter>;
};

export type FileField = {
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
  value?: Maybe<Scalars['String']['output']>;
  atType?: Maybe<Scalars['String']['output']>;
  acc?: Maybe<Scalars['String']['output']>;
  manifestState: ManifestState;
  parentFile?: Maybe<File>;
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
  parentFile?: InputMaybe<Scalars['String']['input']>;
  parentFile_not?: InputMaybe<Scalars['String']['input']>;
  parentFile_gt?: InputMaybe<Scalars['String']['input']>;
  parentFile_lt?: InputMaybe<Scalars['String']['input']>;
  parentFile_gte?: InputMaybe<Scalars['String']['input']>;
  parentFile_lte?: InputMaybe<Scalars['String']['input']>;
  parentFile_in?: InputMaybe<Array<Scalars['String']['input']>>;
  parentFile_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  parentFile_contains?: InputMaybe<Scalars['String']['input']>;
  parentFile_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_contains?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_contains_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_starts_with?: InputMaybe<Scalars['String']['input']>;
  parentFile_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_starts_with?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_starts_with_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_ends_with?: InputMaybe<Scalars['String']['input']>;
  parentFile_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_ends_with?: InputMaybe<Scalars['String']['input']>;
  parentFile_not_ends_with_nocase?: InputMaybe<Scalars['String']['input']>;
  parentFile_?: InputMaybe<File_filter>;
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
  | 'name'
  | 'value'
  | 'atType'
  | 'acc'
  | 'manifestState'
  | 'manifestState__id'
  | 'manifestState__owner'
  | 'manifestState__schemaId'
  | 'manifestState__schemaName'
  | 'manifestState__manifestCid'
  | 'manifestState__version'
  | 'manifestState__lastUpdated'
  | 'parentFile'
  | 'parentFile__id'
  | 'parentFile__tag'
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
  fields_?: InputMaybe<FileField_filter>;
  /** Filter for the block changed event. */
  _change_block?: InputMaybe<BlockChangedFilter>;
  and?: InputMaybe<Array<InputMaybe<File_filter>>>;
  or?: InputMaybe<Array<InputMaybe<File_filter>>>;
};

export type File_orderBy =
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
  manifestCid: Scalars['String']['output'];
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
  and?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
  or?: InputMaybe<Array<InputMaybe<ManifestPublished_filter>>>;
};

export type ManifestPublished_orderBy =
  | 'id'
  | 'owner'
  | 'schemaId'
  | 'manifestCid'
  | 'version'
  | 'blockNumber'
  | 'blockTimestamp'
  | 'transactionHash';

export type ManifestState = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
  schema?: Maybe<SchemaState>;
  schemaName: Scalars['String']['output'];
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
  schema_?: InputMaybe<SchemaState_filter>;
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
  | 'owner'
  | 'schemaId'
  | 'schema'
  | 'schema__id'
  | 'schema__schemaId'
  | 'schema__owner'
  | 'schema__name'
  | 'schemaName'
  | 'manifestCid'
  | 'manifest'
  | 'manifest__id'
  | 'manifest__manifestVersion'
  | 'manifest__schemaId'
  | 'version'
  | 'lastUpdated';

export type ManifestUpdated = {
  id: Scalars['Bytes']['output'];
  owner: Scalars['Bytes']['output'];
  schemaId: Scalars['Bytes']['output'];
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
  files_?: InputMaybe<File_filter>;
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
  version?: Maybe<Scalars['String']['output']>;
  agentId?: Maybe<Scalars['String']['output']>;
  fields?: Maybe<Array<SchemaField>>;
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
  id: Scalars['ID']['output'];
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

  export type QuerySdk = {
      /** null **/
  manifestPublished: InContextSdkMethod<Query['manifestPublished'], QuerymanifestPublishedArgs, MeshContext>,
  /** null **/
  manifestPublisheds: InContextSdkMethod<Query['manifestPublisheds'], QuerymanifestPublishedsArgs, MeshContext>,
  /** null **/
  manifestUpdated: InContextSdkMethod<Query['manifestUpdated'], QuerymanifestUpdatedArgs, MeshContext>,
  /** null **/
  manifestUpdateds: InContextSdkMethod<Query['manifestUpdateds'], QuerymanifestUpdatedsArgs, MeshContext>,
  /** null **/
  schemaRegistered: InContextSdkMethod<Query['schemaRegistered'], QueryschemaRegisteredArgs, MeshContext>,
  /** null **/
  schemaRegistereds: InContextSdkMethod<Query['schemaRegistereds'], QueryschemaRegisteredsArgs, MeshContext>,
  /** null **/
  resourceCreated: InContextSdkMethod<Query['resourceCreated'], QueryresourceCreatedArgs, MeshContext>,
  /** null **/
  resourceCreateds: InContextSdkMethod<Query['resourceCreateds'], QueryresourceCreatedsArgs, MeshContext>,
  /** null **/
  priceUpdated: InContextSdkMethod<Query['priceUpdated'], QuerypriceUpdatedArgs, MeshContext>,
  /** null **/
  priceUpdateds: InContextSdkMethod<Query['priceUpdateds'], QuerypriceUpdatedsArgs, MeshContext>,
  /** null **/
  schemaUpdated: InContextSdkMethod<Query['schemaUpdated'], QueryschemaUpdatedArgs, MeshContext>,
  /** null **/
  schemaUpdateds: InContextSdkMethod<Query['schemaUpdateds'], QueryschemaUpdatedsArgs, MeshContext>,
  /** null **/
  schemaState: InContextSdkMethod<Query['schemaState'], QueryschemaStateArgs, MeshContext>,
  /** null **/
  schemaStates: InContextSdkMethod<Query['schemaStates'], QueryschemaStatesArgs, MeshContext>,
  /** null **/
  schema: InContextSdkMethod<Query['schema'], QueryschemaArgs, MeshContext>,
  /** null **/
  schemas: InContextSdkMethod<Query['schemas'], QueryschemasArgs, MeshContext>,
  /** null **/
  schemaField: InContextSdkMethod<Query['schemaField'], QueryschemaFieldArgs, MeshContext>,
  /** null **/
  schemaFields: InContextSdkMethod<Query['schemaFields'], QueryschemaFieldsArgs, MeshContext>,
  /** null **/
  manifestState: InContextSdkMethod<Query['manifestState'], QuerymanifestStateArgs, MeshContext>,
  /** null **/
  manifestStates: InContextSdkMethod<Query['manifestStates'], QuerymanifestStatesArgs, MeshContext>,
  /** null **/
  manifest: InContextSdkMethod<Query['manifest'], QuerymanifestArgs, MeshContext>,
  /** null **/
  manifests: InContextSdkMethod<Query['manifests'], QuerymanifestsArgs, MeshContext>,
  /** null **/
  file: InContextSdkMethod<Query['file'], QueryfileArgs, MeshContext>,
  /** null **/
  files: InContextSdkMethod<Query['files'], QueryfilesArgs, MeshContext>,
  /** null **/
  fileField: InContextSdkMethod<Query['fileField'], QueryfileFieldArgs, MeshContext>,
  /** null **/
  fileFields: InContextSdkMethod<Query['fileFields'], QueryfileFieldsArgs, MeshContext>,
  /** null **/
  pricingResource: InContextSdkMethod<Query['pricingResource'], QuerypricingResourceArgs, MeshContext>,
  /** null **/
  pricingResources: InContextSdkMethod<Query['pricingResources'], QuerypricingResourcesArgs, MeshContext>,
  /** Access to subgraph metadata **/
  _meta: InContextSdkMethod<Query['_meta'], Query_metaArgs, MeshContext>
  };

  export type MutationSdk = {
    
  };

  export type SubscriptionSdk = {
    
  };

  export type Context = {
      ["FangornMusic"]: { Query: QuerySdk, Mutation: MutationSdk, Subscription: SubscriptionSdk },
      
    };
}
