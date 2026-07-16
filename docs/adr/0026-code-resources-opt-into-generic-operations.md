# Code Resources opt into generic operations

Adopted Resources receive standard generic CRUD constrained by permissions and explicit deletion policy, while Code Resources opt into each generic operation separately and begin with all generic mutations disabled. Disabled operations return HTTP 405 and remain available only through explicit Domain REST endpoints. Specialized Domain Services still pass successful operations through the Resource Lifecycle and emit the same targeted filter/action events.
