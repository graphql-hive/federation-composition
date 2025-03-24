import type { Logger } from '../../../../utils/logger.js';
import { Edge, isAbstractEdge, isEntityEdge, isFieldEdge } from './edge.js';
import { SatisfiabilityError } from './errors.js';
import { concatIfNotExistsFields, concatIfNotExistsString, PathFinder } from './finder.js';
import type { Graph } from './graph.js';
import { lazy, type Lazy } from './helpers.js';
import { OperationPath } from './operation-path.js';
import type { Field, Fragment, Selection, SelectionNode } from './selection.js';

type MoveRequirement<T = SelectionNode> = {
  paths: OperationPath[];
  selection: T;
};

function isFragmentRequirement(
  requirement: MoveRequirement,
): requirement is MoveRequirement<Fragment> {
  return requirement.selection.kind === 'fragment';
}

function isFieldRequirement(requirement: MoveRequirement): requirement is MoveRequirement<Field> {
  return requirement.selection.kind === 'field';
}

type RequirementResult =
  | {
      success: true;
      requirements: MoveRequirement[];
    }
  | {
      success: false;
      errors: Lazy<SatisfiabilityError>[];
    };

export class MoveValidator {
  private logger: Logger;
  private pathFinder: PathFinder;

  constructor(
    logger: Logger,
    private supergraph: Graph,
  ) {
    this.logger = logger.create('MoveValidator');
    this.pathFinder = new PathFinder(this.logger, supergraph, this);
  }

  private canResolveSelectionSet(
    selectionSet: SelectionNode[],
    path: OperationPath,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
  ) {
    const requirements: MoveRequirement[] = [];

    for (const selection of selectionSet) {
      requirements.unshift({
        selection,
        paths: [path.clone()],
      });
    }

    while (requirements.length > 0) {
      // it's important to pop from the end as we want to process the last added requirement first
      const requirement = requirements.pop();

      if (!requirement) {
        break;
      }

      const result = this.validateRequirement(
        requirement,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );

      if (result.success === false) {
        return result;
      }

      for (const innerRequirement of result.requirements) {
        requirements.unshift(innerRequirement);
      }
    }

    return {
      success: true,
      errors: undefined,
    };
  }

  private validateFragmentRequirement(
    requirement: MoveRequirement<Fragment>,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
  ): RequirementResult {
    this.logger.log(() => 'Validating: ... on ' + requirement.selection.typeName);

    const nextPaths: OperationPath[] = [];
    const errors: Lazy<SatisfiabilityError>[] = [];

    // Looks like we hit a fragment spread that matches the current type.
    // It means that it's a fragment spread on an object type, not a union or interface.
    // We can ignore the fragment and continue with the selection set.
    if (requirement.paths[0].tail()?.typeName === requirement.selection.typeName) {
      return {
        success: true,
        requirements: requirement.selection.selectionSet.map(selection => ({
          selection,
          paths: requirement.paths,
        })),
      };
    }

    for (const path of requirement.paths) {
      const directPathsResult = this.pathFinder.findDirectPaths(
        path,
        requirement.selection.typeName,
        null,
        visitedEdges,
      );
      if (directPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible direct paths:');
          for (const path of directPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...directPathsResult.paths);
      } else {
        errors.push(...directPathsResult.errors);
      }
    }

    // // we could add these as lazy
    // try indirect paths
    for (const path of requirement.paths) {
      const indirectPathsResult = this.pathFinder.findIndirectPaths(
        path,
        requirement.selection.typeName,
        null,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );

      if (indirectPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible indirect paths:');
          for (const path of indirectPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...indirectPathsResult.paths);
      } else {
        errors.push(...indirectPathsResult.errors);
      }
    }

    if (nextPaths.length === 0) {
      if (this.logger.isEnabled) {
        this.logger.log(() => 'Could not resolve from:');
        for (const path of requirement.paths) {
          this.logger.log(() => ' ' + path.toString());
        }
      }

      // cannot advance
      return {
        success: false,
        errors,
      };
    }

    if (!requirement.selection.selectionSet || requirement.selection.selectionSet.length === 0) {
      // we reached the end of the path
      return {
        success: true,
        requirements: [],
      };
    }

    return {
      success: true,
      requirements: requirement.selection.selectionSet.map(selection => ({
        selection,
        paths: nextPaths.slice(),
      })),
    };
  }

  private validateFieldRequirement(
    requirement: MoveRequirement<Field>,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
  ): RequirementResult {
    const { fieldName, typeName } = requirement.selection;
    this.logger.log(() => 'Validating: ' + typeName + '.' + fieldName);

    const nextPaths: OperationPath[] = [];
    const errors: Lazy<SatisfiabilityError>[] = [];

    for (const path of requirement.paths) {
      const directPathsResult = this.pathFinder.findDirectPaths(
        path,
        requirement.selection.typeName,
        requirement.selection.fieldName,
        visitedEdges,
      );
      if (directPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible direct paths:');
          for (const path of directPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...directPathsResult.paths);
      } else {
        errors.push(...directPathsResult.errors);
      }
    }

    // we could add make it lazy
    for (const path of requirement.paths) {
      const indirectPathsResult = this.pathFinder.findIndirectPaths(
        path,
        requirement.selection.typeName,
        requirement.selection.fieldName,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );

      if (indirectPathsResult.success) {
        if (this.logger.isEnabled) {
          this.logger.log(() => 'Possible indirect paths:');
          for (const path of indirectPathsResult.paths) {
            this.logger.log(() => ' ' + path.toString());
          }
        }
        nextPaths.push(...indirectPathsResult.paths);
      } else {
        errors.push(...indirectPathsResult.errors);
      }
    }

    if (nextPaths.length === 0) {
      this.logger.log(() => `Failed to resolve field ${typeName}.${fieldName} from:`);
      if (this.logger.isEnabled) {
        for (const path of requirement.paths) {
          this.logger.log(() => ` ` + path);
        }
      }

      // cannot advance
      return {
        success: false,
        errors: errors.filter(e => () => e.get().isMatchingField(typeName, fieldName)),
      };
    }

    if (!requirement.selection.selectionSet || requirement.selection.selectionSet.length === 0) {
      // we reached the end of the path
      return {
        success: true,
        requirements: [],
      };
    }

    return {
      success: true,
      requirements: requirement.selection.selectionSet.map(selection => ({
        selection,
        paths: nextPaths.slice(),
      })),
    };
  }

  private validateRequirement(
    requirement: MoveRequirement,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
  ) {
    if (isFragmentRequirement(requirement)) {
      return this.validateFragmentRequirement(
        requirement,
        visitedEdges,
        visitedGraphs,
        visitedFields,
      );
    }

    if (isFieldRequirement(requirement)) {
      return this.validateFieldRequirement(requirement, visitedEdges, visitedGraphs, visitedFields);
    }

    throw new Error(`Unsupported requirement: ${requirement.selection.kind}`);
  }

  isExternal(edge: Edge): boolean {
    if (!isFieldEdge(edge)) {
      return false;
    }

    if (
      !isFieldEdge(edge) ||
      edge.move.provided ||
      !edge.head.typeState ||
      edge.head.typeState.kind !== 'object'
    ) {
      return false;
    }

    const fieldState = edge.head.typeState.fields.get(edge.move.fieldName);

    if (!fieldState) {
      return false;
    }

    const objectTypeStateInGraph = edge.head.typeState.byGraph.get(edge.head.graphId);
    const fieldStateInGraph = fieldState.byGraph.get(edge.head.graphId);

    if (!fieldStateInGraph || !objectTypeStateInGraph) {
      return false;
    }

    if (!fieldStateInGraph.external) {
      return false;
    }

    if (
      fieldStateInGraph.version === 'v1.0' &&
      objectTypeStateInGraph.extension &&
      fieldState.usedAsKey
    ) {
      return false;
    }

    if (!fieldStateInGraph.usedAsKey) {
      return true;
    }

    if (objectTypeStateInGraph.extension) {
      return false;
    }

    return true;
  }

  private isOverridden(edge: Edge) {
    if (!isFieldEdge(edge) || !edge.head.typeState || edge.head.typeState.kind !== 'object') {
      return false;
    }

    const fieldState = edge.head.typeState.fields.get(edge.move.fieldName);

    if (!fieldState) {
      return false;
    }

    if (!fieldState.override) {
      return false;
    }

    const overriddenGraphId = this.supergraph.graphNameToId(fieldState.override);

    if (!overriddenGraphId) {
      return false;
    }

    return edge.head.graphId === overriddenGraphId;
  }

  isEdgeResolvable(
    edge: Edge,
    path: OperationPath,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
  ):
    | {
        success: true;
        error: undefined;
      }
    | {
        success: false;
        error: Lazy<SatisfiabilityError>;
      } {
    this.logger.group(() => 'Checking resolvability of ' + edge);
    this.logger.log(() => 'Visited graphs: ' + visitedGraphs.join(','));
    const resolvability = edge.getResolvability(
      concatIfNotExistsString(visitedGraphs, edge.tail.graphName),
    );

    if (resolvability) {
      this.logger.groupEnd(() =>
        resolvability.success
          ? `Can move to ${edge}`
          : `Cannot move to ${edge} (already visited: ${resolvability.error.get().kind})`,
      );

      return resolvability;
    }

    if (isFieldEdge(edge)) {
      if (this.isOverridden(edge)) {
        this.logger.groupEnd(() => 'Cannot move to ' + edge + ' because it is overridden');
        return edge.setResolvable(
          false,
          visitedGraphs,
          lazy(() =>
            SatisfiabilityError.forMissingField(
              edge.tail.graphName,
              edge.move.typeName,
              edge.move.fieldName,
            ),
          ),
        );
      }

      if (this.isExternal(edge)) {
        this.logger.groupEnd(
          () => 'Cannot move to ' + edge + ' because it is external and cross-graph',
        );
        return edge.setResolvable(
          false,
          visitedGraphs,
          lazy(() =>
            SatisfiabilityError.forExternal(
              edge.head.graphName,
              edge.move.typeName,
              edge.move.fieldName,
            ),
          ),
        );
      }

      if (edge.move.requires) {
        this.logger.log(() => 'Detected @requires');

        const newVisitedGraphs = edge.isCrossGraphEdge()
          ? concatIfNotExistsString(visitedGraphs, edge.tail.graphName)
          : visitedGraphs;
        const newVisitedFields = concatIfNotExistsFields(visitedFields, edge.move.requires);
        this.logger.log(() => 'Visited graphs: ' + newVisitedGraphs.join(','));
        if (
          this.canResolveSelectionSet(
            edge.move.requires.selectionSet,
            path,
            visitedEdges.concat(edge),
            newVisitedGraphs,
            newVisitedFields,
          ).success
        ) {
          this.logger.groupEnd(() => 'Can move to ' + edge);
          return edge.setResolvable(true, newVisitedGraphs);
        }

        this.logger.groupEnd(
          () => 'Cannot move to ' + edge + ' because @require is not resolvable',
        );

        return {
          success: false,
          error: lazy(() =>
            SatisfiabilityError.forRequire(
              edge.head.graphName,
              edge.move.typeName,
              edge.move.fieldName,
            ),
          ),
        };
      }

      this.logger.groupEnd(() => 'Can move to ' + edge);
      return edge.setResolvable(true, visitedGraphs);
    }

    if (!isEntityEdge(edge) && !isAbstractEdge(edge)) {
      throw new Error('Expected edge to be entity or abstract');
    }

    if (!edge.move.keyFields) {
      this.logger.groupEnd(() => 'Can move to ' + edge);
      return edge.setResolvable(true, visitedGraphs);
    }

    const newVisitedGraphs = concatIfNotExistsString(visitedGraphs, edge.tail.graphName);
    const newVisitedFields = concatIfNotExistsFields(visitedFields, edge.move.keyFields);
    const keyFields = edge.move.keyFields;

    this.logger.log(() => 'Detected @key');
    this.logger.log(() => 'Visited graphs: ' + newVisitedGraphs.join(','));
    const resolvable = this.canResolveSelectionSet(
      keyFields.selectionSet,
      path,
      visitedEdges.concat(edge),
      newVisitedGraphs,
      newVisitedFields,
    ).success;

    if (resolvable) {
      this.logger.groupEnd(() => 'Can move to ' + edge);
      return edge.setResolvable(true, newVisitedGraphs);
    }

    this.logger.groupEnd(() => 'Cannot move to ' + edge + ' because key fields are not resolvable');

    return edge.setResolvable(
      false,
      newVisitedGraphs,
      lazy(() =>
        SatisfiabilityError.forKey(
          edge.head.graphName,
          edge.tail.graphName,
          edge.head.typeName,
          keyFields.toString(),
        ),
      ),
    );
  }
}
