import {
  FilterQuery,
  Model,
  ProjectionType,
  QueryOptions,
  UpdateQuery,
  Types,
} from 'mongoose';
import { NotFoundException } from '@nestjs/common';
import { RESPONSE_CODE } from '../constants';
import { BaseEntity } from './base.entity';

export interface IPaginateOptions {
  page: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
  filter?: FilterQuery<unknown>;
}

export interface IPaginateResult<T> {
  data: T[];
  metaData: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class BaseService<T extends BaseEntity> {
  constructor(protected readonly entityModel: Model<T>) {}

  /** Create a new document */
  async create(data: Partial<T>): Promise<T> {
    const created = new this.entityModel(data);
    return created.save() as Promise<T>;
  }

  /** Find multiple documents */
  async find(
    filter: FilterQuery<T> = {},
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ): Promise<T[]> {
    return this.entityModel
      .find({ ...filter, deletedAt: null }, projection, options)
      .exec() as Promise<T[]>;
  }

  /** Find a single document */
  async findOne(
    filter: FilterQuery<T>,
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ): Promise<T | null> {
    return this.entityModel
      .findOne({ ...filter, deletedAt: null }, projection, options)
      .exec() as Promise<T | null>;
  }

  /** Find a single document or throw 404 */
  async findOneOrThrow(
    filter: FilterQuery<T>,
    projection?: ProjectionType<T>,
    options?: QueryOptions<T>,
  ): Promise<T> {
    const doc = await this.findOne(filter, projection, options);
    if (!doc) {
      throw new NotFoundException(RESPONSE_CODE.common.notFound);
    }
    return doc;
  }

  /** Find by ID */
  async findById(
    id: string | Types.ObjectId,
    projection?: ProjectionType<T>,
  ): Promise<T | null> {
    return this.entityModel
      .findOne(
        { _id: id, deletedAt: null } as FilterQuery<T>,
        projection,
      )
      .exec() as Promise<T | null>;
  }

  /** Find by ID or throw 404 */
  async findByIdOrThrow(
    id: string | Types.ObjectId,
    projection?: ProjectionType<T>,
  ): Promise<T> {
    const doc = await this.findById(id, projection);
    if (!doc) {
      throw new NotFoundException(RESPONSE_CODE.common.notFound);
    }
    return doc;
  }

  /** Find by ID and update */
  async findByIdAndUpdate(
    id: string | Types.ObjectId,
    update: UpdateQuery<T>,
    options?: QueryOptions<T>,
  ): Promise<T | null> {
    return this.entityModel
      .findByIdAndUpdate(id, update, { new: true, ...options })
      .exec() as Promise<T | null>;
  }

  /** Find one and update */
  async findOneAndUpdate(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
    options?: QueryOptions<T>,
  ): Promise<T | null> {
    return this.entityModel
      .findOneAndUpdate(
        { ...filter, deletedAt: null },
        update,
        { new: true, ...options },
      )
      .exec() as Promise<T | null>;
  }

  /** Soft delete */
  async findOneAndDelete(filter: FilterQuery<T>): Promise<T | null> {
    return this.entityModel
      .findOneAndUpdate(
        { ...filter, deletedAt: null },
        { $set: { deletedAt: new Date() } } as UpdateQuery<T>,
        { new: true },
      )
      .exec() as Promise<T | null>;
  }

  /** Count documents */
  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.entityModel
      .countDocuments({ ...filter, deletedAt: null })
      .exec();
  }

  /** Paginate */
  async paginate(options: IPaginateOptions): Promise<IPaginateResult<T>> {
    const { page, limit, sort, filter = {} } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.entityModel
        .find({ ...filter, deletedAt: null } as FilterQuery<T>)
        .sort(sort || { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec() as Promise<T[]>,
      this.count(filter),
    ]);

    return {
      data,
      metaData: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
