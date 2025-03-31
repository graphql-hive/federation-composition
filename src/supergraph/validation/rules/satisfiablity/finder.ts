import type { Logger } from "../../../../utils/logger.js";
import { Edge, isAbstractEdge, isEntityEdge, isFieldEdge } from "./edge.js";
import { LazyErrors, SatisfiabilityError } from "./errors.js";
import type { Graph } from "./graph.js";
import { lazy, OverrideLabels, type Lazy } from "./helpers.js";
import type { MoveValidator } from "./move-validator.js";
import type { OperationPath } from "./operation-path.js";
import { Selection } from "./selection.js";

export function concatIfNotExistsString(
  list: string[],
  item: string,
): string[] {
  if (list.includes(item)) {
    return list;
  }

  return list.concat(item);
}

export function concatIfNotExistsFields(
  list: Selection[],
  item: Selection,
): Selection[] {
  if (list.some((f) => f.equals(item))) {
    return list;
  }

  return list.concat(item);
}

type PathFinderResult =
  | {
      success: true;
      paths: OperationPath[];
      errors: undefined;
    }
  | {
      success: false;
      paths: undefined;
      errors: LazyErrors<SatisfiabilityError>;
    };

export class PathFinder {
  constructor(
    private logger: Logger,
    private graph: Graph,
    private moveValidator: MoveValidator,
  ) {}

  findDirectPaths(
    path: OperationPath,
    typeName: string,
    fieldName: string | null,
    visitedEdges: Edge[],
    labelValues: OverrideLabels,
  ): PathFinderResult {
    const nextPaths: OperationPath[] = [];
    const errors = new LazyErrors<SatisfiabilityError>();
    const tail = path.tail() ?? path.rootNode();
    const isFieldTarget = fieldName !== null;
    const id = isFieldTarget
      ? `${typeName}.${fieldName}`
      : `... on ${typeName}`;

    this.logger.group(() => "Direct paths to " + id + " from: " + tail);

    const edges = isFieldTarget
      ? this.graph.fieldEdgesOfHead(tail, fieldName)
      : this.graph.abstractEdgesOfHead(tail);

    this.logger.log(() => "Checking " + edges.length + " edges");

    let i = 0;
    for (const edge of edges) {
      this.logger.group(() => "Checking #" + i++ + " " + edge);

      if (nextPaths.some((p) => p.tail() === edge.tail)) {
        this.logger.groupEnd(() => "Already resolvable tail: " + edge);
        continue;
      }

      if (edge.isCrossGraphEdge()) {
        this.logger.groupEnd(() => "Cross graph edge: " + edge);
        continue;
      }

      if (visitedEdges.includes(edge)) {
        this.logger.groupEnd(() => "Already visited: " + edge);
        continue;
      }

      if (!isFieldTarget) {
        if (isAbstractEdge(edge) && edge.tail.typeName === typeName) {
          this.logger.groupEnd(() => "Resolvable: " + edge);
          const newPath = path.clone().move(edge);
          nextPaths.push(newPath);
          continue;
        }
      }

      if (
        isFieldTarget &&
        isFieldEdge(edge) &&
        edge.move.fieldName === fieldName
      ) {
        const resolvable = this.moveValidator.isEdgeResolvable(
          edge,
          path,
          [],
          [],
          [],
          labelValues,
        );
        if (!resolvable.success) {
          errors.add(resolvable.error);
          this.logger.groupEnd(() => "Not resolvable: " + edge);
          continue;
        }

        this.logger.groupEnd(() => "Resolvable: " + edge);
        const newPath = path.clone().move(edge);
        nextPaths.push(newPath);
        continue;
      }

      this.logger.groupEnd(() => "Not matching");
    }

    this.logger.groupEnd(() => "Found " + nextPaths.length + " direct paths");

    if (nextPaths.length > 0) {
      return {
        success: true,
        paths: nextPaths,
        errors: undefined,
      };
    }

    if (!errors.isEmpty()) {
      return {
        success: false,
        errors,
        paths: undefined,
      };
    }

    if (!isFieldTarget) {
      if (
        tail.typeState?.kind === "interface" &&
        tail.typeState.hasInterfaceObject
      ) {
        const typeStateInGraph = tail.typeState.byGraph.get(tail.graphId);

        if (typeStateInGraph?.isInterfaceObject) {
          // no subgraph can be reached to resolve the implementation type of @interfaceObject type
          return {
            success: false,
            errors: new LazyErrors<SatisfiabilityError>().add(
              lazy(() =>
                SatisfiabilityError.forNoImplementation(
                  tail.graphName,
                  tail.typeName,
                ),
              ),
            ),
            paths: undefined,
          };
        }
      }

      // This is a special case where we are looking for an abstract type, but there are no edges leading to it.
      // It's completely fine, as abstract types are not resolvable by themselves and Federation will handle it (return empty result).
      return {
        success: true,
        errors: undefined,
        paths: [],
      };
    }

    // In case of no errors, we know that there were no edges matching the field name.
    errors.add(
      lazy(() =>
        SatisfiabilityError.forMissingField(
          tail.graphName,
          typeName,
          fieldName,
        ),
      ),
    );

    errors.add(
      lazy(() => {
        const errors: SatisfiabilityError[] = [];
        // find graphs with the same type and field name, but no @key defined
        const typeNodes = this.graph.nodesOf(typeName);
        for (const typeNode of typeNodes) {
          const edges = this.graph.fieldEdgesOfHead(typeNode, fieldName);
          for (const edge of edges) {
            if (
              isFieldEdge(edge) &&
              // edge.move.typeName === typeName &&
              edge.move.fieldName === fieldName &&
              !this.moveValidator.isExternal(edge)
            ) {
              const typeStateInGraph =
                edge.head.typeState &&
                edge.head.typeState.kind === "object" &&
                edge.head.typeState.byGraph.get(edge.head.graphId);
              const keys = typeStateInGraph
                ? typeStateInGraph.keys.filter((key) => key.resolvable)
                : [];

              if (keys.length === 0) {
                errors.push(
                  SatisfiabilityError.forNoKey(
                    tail.graphName,
                    edge.tail.graphName,
                    typeName,
                    fieldName,
                  ),
                );
              }
            }
          }
        }

        return errors;
      }),
    );

    return {
      success: false,
      errors,
      paths: undefined,
    };
  }

  private findFieldIndirectly(
    path: OperationPath,
    typeName: string,
    fieldName: string,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
    labelValues: OverrideLabels,
    errors: LazyErrors<SatisfiabilityError>,
    finalPaths: OperationPath[],
    queue: [string[], Selection[], OperationPath][],
    resolvedGraphs: string[],
    edge: Edge,
  ) {
    if (!isEntityEdge(edge) && !isAbstractEdge(edge)) {
      this.logger.groupEnd(() => "Ignored");
      return;
    }

    if (resolvedGraphs.includes(edge.tail.graphName)) {
      this.logger.groupEnd(() => "Ignore: already resolved this graph");
      return;
    }

    // A huge win for performance, is when you do less work :D
    // We can ignore an edge that has already been visited with the same key fields / requirements.
    // The way entity-move edges are created, where every graph points to every other graph:
    //  Graph A: User @key(id) @key(name)
    //  Graph B: User @key(id)
    //  Edges in a merged graph:
    //    - User/A @key(id) -> User/B
    //    - User/B @key(id) -> User/A
    //    - User/B @key(name) -> User/A
    // Allows us to ignore an edge with the same key fields.
    // That's because in some other path, we will or already have checked the other edge.
    if (
      !!edge.move.keyFields &&
      visitedFields.some((f) => f.equals(edge.move.keyFields!))
    ) {
      this.logger.groupEnd(() => "Ignore: already visited fields");
      return;
    }

    if (isAbstractEdge(edge)) {
      // prevent a situation where we are doing a second abstract move
      const tailEdge = path.edge();

      if (tailEdge && isAbstractEdge(tailEdge) && !edge.move.keyFields) {
        this.logger.groupEnd(
          () => "Ignore: cannot do two abstract moves in a row",
        );
        return;
      }

      if (!edge.isCrossGraphEdge()) {
        const newPath = path.clone().move(edge);
        queue.push([visitedGraphs, visitedFields, newPath]);
        this.logger.log(() => "Abstract move");
        this.logger.groupEnd(() => "Adding to queue: " + newPath);
        return;
      }
    }

    const resolvable = this.moveValidator.isEdgeResolvable(
      edge,
      path,
      visitedEdges.concat(edge),
      visitedGraphs,
      visitedFields,
      labelValues,
    );

    if (!resolvable.success) {
      errors.add(resolvable.error);
      this.logger.groupEnd(() => "Not resolvable: " + resolvable.error);
      return;
    }

    const newPath = path.clone().move(edge);

    this.logger.log(
      () =>
        "From indirect path, look for direct paths to " +
        typeName +
        "." +
        fieldName +
        " from: " +
        edge,
    );
    const direct = this.findDirectPaths(
      newPath,
      typeName,
      fieldName,
      [edge],
      labelValues,
    );

    if (direct.success) {
      this.logger.groupEnd(
        () => "Resolvable: " + edge + " with " + direct.paths.length + " paths",
      );

      finalPaths.push(...direct.paths);
      resolvedGraphs.push(newPath.edge()!.tail.graphName);
      return;
    }

    errors.add(direct.errors);

    resolvedGraphs.push(newPath.edge()!.tail.graphName);

    queue.push([
      concatIfNotExistsString(visitedGraphs, edge.tail.graphName),
      "keyFields" in edge.move && edge.move.keyFields
        ? concatIfNotExistsFields(visitedFields, edge.move.keyFields)
        : visitedFields,
      newPath,
    ]);
    this.logger.log(() => "Did not find direct paths");
    this.logger.groupEnd(() => "Adding to queue: " + newPath);
  }

  private findTypeIndirectly(
    path: OperationPath,
    typeName: string,
    visitedGraphs: string[],
    visitedFields: Selection[],
    labelValues: OverrideLabels,
    finalPaths: OperationPath[],
    queue: [string[], Selection[], OperationPath][],
    resolvedGraphs: string[],
    edge: Edge,
  ) {
    if (!isAbstractEdge(edge)) {
      this.logger.groupEnd(() => "Ignored");
      return;
    }

    if (resolvedGraphs.includes(edge.tail.graphName)) {
      this.logger.groupEnd(() => "Already resolved the graph");
      return;
    }

    if (
      edge.move.keyFields &&
      visitedFields.some((f) => f.equals(edge.move.keyFields!))
    ) {
      this.logger.groupEnd(() => "Ignore: already visited fields");
      return;
    }

    const newPath = path.clone().move(edge);

    // If the target is the tail of this edge, we have found a path
    if (edge.tail.typeName === typeName) {
      resolvedGraphs.push(edge.tail.graphName);
      finalPaths.push(newPath);
    } else {
      // Otherwise, we need to continue searching for the target
      queue.push([
        visitedGraphs,
        edge.move.keyFields
          ? concatIfNotExistsFields(visitedFields, edge.move.keyFields)
          : visitedFields,
        newPath,
      ]);
    }
    this.logger.groupEnd(() => "Resolvable");
  }

  findIndirectPaths(
    path: OperationPath,
    typeName: string,
    fieldName: string | null,
    visitedEdges: Edge[],
    visitedGraphs: string[],
    visitedFields: Selection[],
    labelValues: OverrideLabels,
  ): PathFinderResult {
    const errors = new LazyErrors<SatisfiabilityError>();
    const tail = path.tail() ?? path.rootNode();
    const sourceGraphName = tail.graphName;
    const isFieldTarget = fieldName !== null;
    const id = isFieldTarget
      ? `${typeName}.${fieldName}`
      : `... on ${typeName}`;

    this.logger.group(() => "Indirect paths to " + id + " from: " + tail);

    const queue: [string[], Selection[], OperationPath][] = [
      [visitedGraphs, visitedFields, path],
    ];
    const finalPaths: OperationPath[] = [];
    const resolvedGraphs: string[] = [];

    while (queue.length > 0) {
      const item = queue.pop();

      if (!item) {
        throw new Error("Unexpected end of queue");
      }

      const [visitedGraphs, visitedFields, path] = item;
      const tail = path.tail() ?? path.rootNode();
      const edges = this.graph.indirectEdgesOfHead(tail);

      this.logger.log(() => "At path: " + path);
      this.logger.log(() => "Checking " + edges.length + " edges");
      let i = 0;
      for (const edge of edges) {
        this.logger.group(() => "Checking #" + i++ + " " + edge);
        this.logger.log(() => "Visited graphs: " + visitedGraphs.join(","));

        if (visitedGraphs.includes(edge.tail.graphName)) {
          this.logger.groupEnd(() => "Ignore: already visited graph");
          continue;
        }

        if (visitedEdges.includes(edge)) {
          this.logger.groupEnd(() => "Ignore: already visited edge");
          continue;
        }

        if (edge.tail.graphName === sourceGraphName && !isAbstractEdge(edge)) {
          // Prevent a situation where we are going back to the same graph
          // The only exception is when we are moving to an abstract type
          this.logger.groupEnd(() => "Ignore: we are back to the same graph");
          continue;
        }

        if (isFieldTarget) {
          this.findFieldIndirectly(
            path,
            typeName,
            fieldName,
            visitedEdges,
            visitedGraphs,
            visitedFields,
            labelValues,
            errors,
            finalPaths,
            queue,
            resolvedGraphs,
            edge,
          );
        } else {
          this.findTypeIndirectly(
            path,
            typeName,
            visitedGraphs,
            visitedFields,
            labelValues,
            finalPaths,
            queue,
            resolvedGraphs,
            edge,
          );
        }
      }
    }

    this.logger.groupEnd(
      () => "Found " + finalPaths.length + " indirect paths",
    );

    if (finalPaths.length === 0) {
      return {
        success: false,
        errors,
        paths: undefined,
      };
    }

    return {
      success: true,
      paths: finalPaths,
      errors: undefined,
    };
  }
}
