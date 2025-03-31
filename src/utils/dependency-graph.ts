/// copies from github:kamilkisiela/dependency-graph

export interface Options {
  circular?: boolean;
}

/**
 * Helper for creating a Topological Sort using Depth-First-Search on a set of edges.
 *
 * Detects cycles and throws an Error if one is detected (unless the "circular"
 * parameter is "true" in which case it ignores them).
 *
 * @param edges The set of edges to DFS through
 * @param leavesOnly Whether to only return "leaf" nodes (ones who have no edges)
 * @param result An array in which the results will be populated
 * @param circular A boolean to allow circular dependencies
 */
function createDFS(
  /**
   * The set of edges to DFS through
   */
  edges: {
    [key: string]: string[];
  },
  /**
   * Whether to only return "leaf" nodes (ones who have no edges)
   */
  leavesOnly: boolean | undefined,
  /**
   * An array in which the results will be populated
   */
  result: string[],
  /**
   * A boolean to allow circular dependencies
   */
  circular: boolean,
) {
  const visited: {
    [key: string]: boolean;
  } = {};
  return function (start: string) {
    if (visited[start]) {
      return;
    }
    const inCurrentPath: {
      [key: string]: boolean;
    } = {};
    const currentPath: string[] = [];
    const todo: Array<{
      node: string;
      processed: boolean;
    }> = []; // used as a stack
    todo.push({ node: start, processed: false });
    while (todo.length > 0) {
      const current = todo[todo.length - 1]; // peek at the todo stack
      const processed = current.processed;
      const node = current.node;
      if (!processed) {
        // Haven't visited edges yet (visiting phase)
        if (visited[node]) {
          todo.pop();
          continue;
        } else if (inCurrentPath[node]) {
          // It's not a DAG
          if (circular) {
            todo.pop();
            // If we're tolerating cycles, don't revisit the node
            continue;
          }
          currentPath.push(node);
          throw new DepGraphCycleError(currentPath);
        }

        inCurrentPath[node] = true;
        currentPath.push(node);
        const nodeEdges = edges[node];
        // (push edges onto the todo stack in reverse order to be order-compatible with the old DFS implementation)
        for (let i = nodeEdges.length - 1; i >= 0; i--) {
          todo.push({ node: nodeEdges[i], processed: false });
        }
        current.processed = true;
      } else {
        // Have visited edges (stack unrolling phase)
        todo.pop();
        currentPath.pop();
        inCurrentPath[node] = false;
        visited[node] = true;
        if (!leavesOnly || edges[node].length === 0) {
          result.push(node);
        }
      }
    }
  };
}

export class DepGraph<T> {
  private nodes: {
    // Node -> Node/Data (treated like a Set)
    [key: string]: T | string | undefined;
  } = {};
  private outgoingEdges: {
    // Node -> [Dependency Node]
    [key: string]: string[];
  } = {};
  private incomingEdges: {
    // Node -> [Dependant Node]
    [key: string]: string[];
  } = {};
  private circular: boolean; // Allows circular deps

  constructor(opts?: Options) {
    this.circular = opts?.circular ?? false;
  }

  /**
   * The number of nodes in the graph.
   */
  size() {
    return Object.keys(this.nodes).length;
  }
  /**
   * Add a node to the dependency graph. If a node already exists, this method will do nothing.
   */
  addNode(name: string, data?: T) {
    if (!this.hasNode(name)) {
      // Checking the arguments length allows the user to add a node with undefined data
      if (arguments.length === 2) {
        this.nodes[name] = data;
      } else {
        this.nodes[name] = name;
      }
      this.outgoingEdges[name] = [];
      this.incomingEdges[name] = [];
    }
  }
  /**
   * Remove a node from the dependency graph. If a node does not exist, this method will do nothing.
   */
  removeNode(name: string) {
    if (this.hasNode(name)) {
      delete this.nodes[name];
      delete this.outgoingEdges[name];
      delete this.incomingEdges[name];
      [this.incomingEdges, this.outgoingEdges].forEach((edgeList) => {
        Object.keys(edgeList).forEach((key) => {
          const idx = edgeList[key].indexOf(name);
          if (idx >= 0) {
            edgeList[key].splice(idx, 1);
          }
        });
      });
    }
  }
  /**
   * Check if a node exists in the graph
   */
  hasNode(name: string) {
    return this.nodes.hasOwnProperty(name);
  }
  /**
   * Get the data associated with a node name
   */
  getNodeData(name: string) {
    if (this.hasNode(name)) {
      return this.nodes[name];
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * Set the associated data for a given node name. If the node does not exist, this method will throw an error
   */
  setNodeData(name: string, data?: T) {
    if (this.hasNode(name)) {
      this.nodes[name] = data;
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * Add a dependency between two nodes. If either of the nodes does not exist,
   * an Error will be thrown.
   */
  addDependency(from: string, to: string) {
    if (!this.hasNode(from)) {
      throw new Error("Node does not exist: " + from);
    }
    if (!this.hasNode(to)) {
      throw new Error("Node does not exist: " + to);
    }
    if (this.outgoingEdges[from].indexOf(to) === -1) {
      this.outgoingEdges[from].push(to);
    }
    if (this.incomingEdges[to].indexOf(from) === -1) {
      this.incomingEdges[to].push(from);
    }
    return true;
  }
  /**
   * Remove a dependency between two nodes.
   */
  removeDependency(from: string, to: string) {
    let idx: number;
    if (this.hasNode(from)) {
      idx = this.outgoingEdges[from].indexOf(to);
      if (idx >= 0) {
        this.outgoingEdges[from].splice(idx, 1);
      }
    }

    if (this.hasNode(to)) {
      idx = this.incomingEdges[to].indexOf(from);
      if (idx >= 0) {
        this.incomingEdges[to].splice(idx, 1);
      }
    }
  }
  /**
   * Get an array containing the direct dependencies of the specified node.
   *
   * Throws an Error if the specified node does not exist.
   */
  directDependenciesOf(name: string) {
    if (this.hasNode(name)) {
      return this.outgoingEdges[name].slice(0);
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * Get an array containing the nodes that directly depend on the specified node.
   *
   * Throws an Error if the specified node does not exist.
   */
  directDependantsOf(name: string) {
    if (this.hasNode(name)) {
      return this.incomingEdges[name].slice(0);
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * Get an array containing the nodes that the specified node depends on (transitively).
   *
   * Throws an Error if the graph has a cycle, or the specified node does not exist.
   *
   * If `leavesOnly` is true, only nodes that do not depend on any other nodes will be returned
   * in the array.
   */
  dependenciesOf(name: string, leavesOnly?: boolean) {
    if (this.hasNode(name)) {
      const result: string[] = [];
      const DFS = createDFS(
        this.outgoingEdges,
        leavesOnly,
        result,
        this.circular,
      );
      DFS(name);
      const idx = result.indexOf(name);
      if (idx >= 0) {
        result.splice(idx, 1);
      }
      return result;
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * get an array containing the nodes that depend on the specified node (transitively).
   *
   * Throws an Error if the graph has a cycle, or the specified node does not exist.
   *
   * If `leavesOnly` is true, only nodes that do not have any dependants will be returned in the array.
   */
  dependantsOf(name: string, leavesOnly?: boolean) {
    if (this.hasNode(name)) {
      const result: string[] = [];
      const DFS = createDFS(
        this.incomingEdges,
        leavesOnly,
        result,
        this.circular,
      );
      DFS(name);
      const idx = result.indexOf(name);
      if (idx >= 0) {
        result.splice(idx, 1);
      }
      return result;
    } else {
      throw new Error("Node does not exist: " + name);
    }
  }
  /**
   * Construct the overall processing order for the dependency graph.
   *
   * Throws an Error if the graph has a cycle.
   *
   * If `leavesOnly` is true, only nodes that do not depend on any other nodes will be returned.
   */
  overallOrder(leavesOnly?: boolean) {
    const result: string[] = [];
    const keys = Object.keys(this.nodes);
    if (keys.length === 0) {
      return result; // Empty graph
    } else {
      if (!this.circular) {
        // Look for cycles - we run the DFS starting at all the nodes in case there
        // are several disconnected subgraphs inside this dependency graph.
        const CycleDFS = createDFS(
          this.outgoingEdges,
          false,
          [],
          this.circular,
        );
        keys.forEach(function (n) {
          CycleDFS(n);
        });
      }

      const DFS = createDFS(
        this.outgoingEdges,
        leavesOnly,
        result,
        this.circular,
      );
      // Find all potential starting points (nodes with nothing depending on them) an
      // run a DFS starting at these points to get the order
      keys
        .filter((node) => this.incomingEdges[node].length === 0)
        .forEach((n) => {
          DFS(n);
        });

      // If we're allowing cycles - we need to run the DFS against any remaining
      // nodes that did not end up in the initial result (as they are part of a
      // subgraph that does not have a clear starting point)
      if (this.circular) {
        keys
          .filter((node) => result.indexOf(node) === -1)
          .forEach(function (n) {
            DFS(n);
          });
      }

      return result;
    }
  }
  /**
   * Get an array of nodes that have no dependants (i.e. nothing depends on them).
   */
  entryNodes() {
    return Object.keys(this.nodes).filter(
      (node) => this.incomingEdges[node].length === 0,
    );
  }

  // Create some aliases
  directDependentsOf = this.directDependantsOf;
  dependentsOf = this.dependantsOf;
}

/**
 * Cycle error, including the path of the cycle.
 */
export class DepGraphCycleError extends Error {
  constructor(public cyclePath: string[]) {
    super("Dependency Cycle Found: " + cyclePath.join(" -> "));
  }
}
